/**
 * HYBRID STORAGE SERVICE
 *
 * Combines Replit Object Storage (hot tier) with Pocket Dimension (cold tier)
 * for intelligent, cost-effective storage with automatic tiering.
 *
 * Hot  → Replit Object Storage : recent / frequently accessed files
 * Cold → Pocket Dimension       : archives, old versions, rarely accessed (30+ days)
 */

import { pocketManager, PocketDimension } from "../pocket-dimension/index.js";
import { createHash } from "crypto";
import { logger } from "../logger.js";
import fs from "fs/promises";

const COLD_THRESHOLD_DAYS = 30;
const COLD_THRESHOLD_MS = COLD_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
const HOT_ACCESS_THRESHOLD = 5;
const SIZE_COLD_THRESHOLD = 50 * 1024 * 1024; // 50 MB → auto cold
const INDEX_PATH = "./data/hybrid-storage-index.json";

export type StorageTier = "hot" | "cold";
export type StorageLocation = "replit" | "pocket-dimension";

export interface HybridFileMetadata {
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  compressedSize: number;
  tier: StorageTier;
  location: StorageLocation;
  contentHash: string;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  userId: string;
  isPublic: boolean;
  isDeduplicated: boolean;
  deduplicationRef?: string;
  folder?: string;
}

export interface UploadResult {
  key: string;
  tier: StorageTier;
  location: StorageLocation;
  sizeBytes: number;
  compressedSize: number;
  contentHash: string;
  isDeduplicated: boolean;
}

export interface StorageAnalytics {
  totalFiles: number;
  totalSizeBytes: number;
  tierBreakdown: {
    hot: { count: number; sizeBytes: number };
    cold: { count: number; sizeBytes: number; compressedSize: number };
  };
  deduplicationSavings: number;
  recommendations: Array<{ type: string; priority: string; message: string }>;
}

export class HybridStorageService {
  private static instance: HybridStorageService;
  private replitClient: any = null;
  private coldPocket: PocketDimension | null = null;
  private initialized = false;

  private fileIndex = new Map<string, HybridFileMetadata>();
  private contentHashIndex = new Map<string, string[]>();

  private constructor() {}

  static getInstance(): HybridStorageService {
    if (!HybridStorageService.instance) {
      HybridStorageService.instance = new HybridStorageService();
    }
    return HybridStorageService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try Replit Object Storage hot tier
    try {
      const probe = await fetch(
        "http://127.0.0.1:1106/object-storage/default-bucket",
        {
          signal: AbortSignal.timeout(600),
        },
      ).catch(() => null);

      if (probe?.ok) {
        const { Client } = await import("@replit/object-storage");
        const bucketId =
          process.env.REPLIT_BUCKET_ID ??
          process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        this.replitClient = new Client(bucketId ? { bucketId } : undefined);
        logger.info("[HybridStorage] Replit Object Storage hot tier ready");
      } else {
        logger.warn(
          "[HybridStorage] Hot tier (Replit) not available — cold tier only",
        );
      }
    } catch {
      logger.warn("[HybridStorage] Replit client init failed — cold tier only");
    }

    // Cold tier always available
    this.coldPocket = await pocketManager.openPocket("hybrid-cold-storage", {
      compressionLevel: 9,
      enableDeduplication: true,
      enableVersioning: true,
      chunkSize: 32 * 1024 * 1024,
    });

    await this.loadIndex();
    this.initialized = true;
    logger.info("[HybridStorage] Initialized");
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async upload(
    userId: string,
    originalName: string,
    data: Buffer,
    mimeType: string,
    opts: {
      folder?: string;
      forceTier?: StorageTier;
      forceLocation?: StorageLocation;
      isPublic?: boolean;
    } = {},
  ): Promise<UploadResult> {
    await this.initialize();

    const contentHash = createHash("sha256").update(data).digest("hex");

    // Deduplication check
    const existingKeys = this.contentHashIndex.get(contentHash);
    if (existingKeys?.length) {
      const existing = this.fileIndex.get(existingKeys[0]);
      if (existing) {
        logger.info(
          `[HybridStorage] Dedup hit for ${originalName} → ${existingKeys[0]}`,
        );
        const key = this.generateKey(userId, originalName, opts.folder);
        const meta: HybridFileMetadata = {
          ...existing,
          key,
          userId,
          originalName,
          isDeduplicated: true,
          deduplicationRef: existingKeys[0],
          accessCount: 0,
          createdAt: new Date(),
          lastAccessed: new Date(),
        };
        this.fileIndex.set(key, meta);
        this.addToHashIndex(contentHash, key);
        await this.saveIndex();
        return {
          key,
          tier: existing.tier,
          location: existing.location,
          sizeBytes: data.length,
          compressedSize: existing.compressedSize,
          contentHash,
          isDeduplicated: true,
        };
      }
    }

    // Choose tier
    const tier: StorageTier =
      opts.forceTier ?? (data.length >= SIZE_COLD_THRESHOLD ? "cold" : "hot");

    let location: StorageLocation;
    let compressedSize = data.length;

    const key = this.generateKey(userId, originalName, opts.folder);

    if (
      tier === "hot" &&
      this.replitClient &&
      opts.forceLocation !== "pocket-dimension"
    ) {
      // Hot path — Replit Object Storage
      try {
        const { ok, error } = await this.replitClient.uploadFromBytes(
          this.hotKey(key),
          data,
          { contentType: mimeType },
        );
        if (!ok) throw new Error(error ?? "Upload failed");
        location = "replit";
      } catch (err) {
        logger.warn(
          "[HybridStorage] Hot tier failed, falling back to cold:",
          err,
        );
        await this.writeToCold(key, data);
        location = "pocket-dimension";
        compressedSize = Math.round(data.length * 0.4);
      }
    } else {
      // Cold path — Pocket Dimension
      await this.writeToCold(key, data);
      location = "pocket-dimension";
      compressedSize = Math.round(data.length * 0.4);
    }

    const meta: HybridFileMetadata = {
      key,
      originalName,
      mimeType,
      sizeBytes: data.length,
      compressedSize,
      tier,
      location,
      contentHash,
      accessCount: 0,
      lastAccessed: new Date(),
      createdAt: new Date(),
      userId,
      isPublic: opts.isPublic ?? false,
      isDeduplicated: false,
      folder: opts.folder,
    };

    this.fileIndex.set(key, meta);
    this.addToHashIndex(contentHash, key);
    await this.saveIndex();

    return {
      key,
      tier,
      location,
      sizeBytes: data.length,
      compressedSize,
      contentHash,
      isDeduplicated: false,
    };
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async read(userId: string, key: string): Promise<Buffer> {
    await this.initialize();

    const meta = this.resolveKey(userId, key);
    if (!meta) throw new Error(`File not found: ${key}`);

    let data: Buffer;

    if (meta.isDeduplicated && meta.deduplicationRef) {
      return this.read(userId, meta.deduplicationRef);
    }

    if (meta.location === "replit" && this.replitClient) {
      try {
        const { ok, value, error } = await this.replitClient.downloadAsBytes(
          this.hotKey(key),
        );
        if (!ok) throw new Error(error ?? "Download failed");
        data = Buffer.from(value as Uint8Array);
      } catch {
        data = await this.readFromCold(key);
      }
    } else {
      data = await this.readFromCold(key);
    }

    // Update access stats
    meta.accessCount += 1;
    meta.lastAccessed = new Date();
    this.fileIndex.set(key, meta);
    await this.saveIndex();

    return data;
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(userId: string, key: string): Promise<boolean> {
    await this.initialize();

    const meta = this.fileIndex.get(key);
    if (!meta || meta.userId !== userId) return false;

    if (!meta.isDeduplicated) {
      if (meta.location === "replit" && this.replitClient) {
        await this.replitClient.delete(this.hotKey(key)).catch(() => {});
      }
      await this.deletFromCold(key);

      // Remove from hash index
      const keys = this.contentHashIndex.get(meta.contentHash) ?? [];
      const updated = keys.filter((k) => k !== key);
      if (updated.length === 0) this.contentHashIndex.delete(meta.contentHash);
      else this.contentHashIndex.set(meta.contentHash, updated);
    }

    this.fileIndex.delete(key);
    await this.saveIndex();
    return true;
  }

  // ── Tiering ───────────────────────────────────────────────────────────────

  async autoTier(): Promise<{ tieredDown: number; tieredUp: number }> {
    await this.initialize();
    let tieredDown = 0;
    let tieredUp = 0;
    const now = Date.now();

    for (const [key, meta] of this.fileIndex) {
      const idleMs = now - meta.lastAccessed.getTime();

      if (
        meta.tier === "hot" &&
        idleMs > COLD_THRESHOLD_MS &&
        meta.accessCount < HOT_ACCESS_THRESHOLD
      ) {
        // Move hot → cold
        try {
          if (meta.location === "replit" && this.replitClient) {
            const { ok, value } = await this.replitClient.downloadAsBytes(
              this.hotKey(key),
            );
            if (ok) {
              await this.writeToCold(key, Buffer.from(value as Uint8Array));
              await this.replitClient.delete(this.hotKey(key)).catch(() => {});
              meta.tier = "cold";
              meta.location = "pocket-dimension";
              this.fileIndex.set(key, meta);
              tieredDown++;
            }
          }
        } catch (err) {
          logger.warn(`[HybridStorage] Tier-down failed for ${key}:`, err);
        }
      } else if (
        meta.tier === "cold" &&
        meta.accessCount >= HOT_ACCESS_THRESHOLD &&
        this.replitClient
      ) {
        // Move cold → hot
        try {
          const data = await this.readFromCold(key);
          const { ok } = await this.replitClient.uploadFromBytes(
            this.hotKey(key),
            data,
          );
          if (ok) {
            await this.deletFromCold(key);
            meta.tier = "hot";
            meta.location = "replit";
            this.fileIndex.set(key, meta);
            tieredUp++;
          }
        } catch (err) {
          logger.warn(`[HybridStorage] Tier-up failed for ${key}:`, err);
        }
      }
    }

    if (tieredDown || tieredUp) await this.saveIndex();
    return { tieredDown, tieredUp };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getMetadata(key: string): HybridFileMetadata | null {
    return this.fileIndex.get(key) ?? null;
  }

  listFiles(
    userId: string,
    opts: {
      tier?: StorageTier;
      location?: StorageLocation;
      folder?: string;
    } = {},
  ): HybridFileMetadata[] {
    return [...this.fileIndex.values()].filter((m) => {
      if (m.userId !== userId) return false;
      if (opts.tier && m.tier !== opts.tier) return false;
      if (opts.location && m.location !== opts.location) return false;
      if (opts.folder && m.folder !== opts.folder) return false;
      return true;
    });
  }

  async getDownloadUrl(_userId: string, key: string): Promise<string> {
    return `/api/hybrid-storage/file/${encodeURIComponent(key)}`;
  }

  async getAnalytics(userId: string): Promise<StorageAnalytics> {
    const files = this.listFiles(userId);
    const hot = files.filter((f) => f.tier === "hot");
    const cold = files.filter((f) => f.tier === "cold");
    const dedup = files.filter((f) => f.isDeduplicated);
    const deduplicationSavings = dedup.reduce((s, f) => s + f.sizeBytes, 0);

    const recommendations: Array<{
      type: string;
      priority: string;
      message: string;
    }> = [];
    const idleHot = hot.filter(
      (f) => Date.now() - f.lastAccessed.getTime() > COLD_THRESHOLD_MS,
    );
    if (idleHot.length > 0) {
      recommendations.push({
        type: "tier_down",
        priority: "medium",
        message: `${idleHot.length} idle hot file(s) can be moved to cold storage`,
      });
    }

    return {
      totalFiles: files.length,
      totalSizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
      tierBreakdown: {
        hot: {
          count: hot.length,
          sizeBytes: hot.reduce((s, f) => s + f.sizeBytes, 0),
        },
        cold: {
          count: cold.length,
          sizeBytes: cold.reduce((s, f) => s + f.sizeBytes, 0),
          compressedSize: cold.reduce((s, f) => s + f.compressedSize, 0),
        },
      },
      deduplicationSavings,
      recommendations,
    };
  }

  async cleanup(
    userId: string,
    opts: { olderThanDays?: number } = {},
  ): Promise<{ deletedCount: number; freedBytes: number }> {
    const thresholdMs = (opts.olderThanDays ?? 90) * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deletedCount = 0;
    let freedBytes = 0;

    for (const [key, meta] of this.fileIndex) {
      if (meta.userId !== userId) continue;
      if (
        now - meta.lastAccessed.getTime() > thresholdMs &&
        meta.accessCount === 0
      ) {
        await this.delete(userId, key);
        deletedCount++;
        freedBytes += meta.sizeBytes;
      }
    }

    return { deletedCount, freedBytes };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private hotKey(key: string): string {
    return `hybrid-hot/${key}`;
  }

  private coldKey(key: string): string {
    return `cold/${key}`;
  }

  private async writeToCold(key: string, data: Buffer): Promise<void> {
    await this.coldPocket!.write(this.coldKey(key), data);
  }

  private async readFromCold(key: string): Promise<Buffer> {
    const data = await this.coldPocket!.read(this.coldKey(key));
    if (!data) throw new Error(`Cold data not found: ${key}`);
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  private async deletFromCold(key: string): Promise<void> {
    await this.coldPocket!.delete(this.coldKey(key)).catch(() => {});
  }

  private resolveKey(userId: string, key: string): HybridFileMetadata | null {
    const meta = this.fileIndex.get(key);
    if (!meta) return null;
    if (meta.userId !== userId && !meta.isPublic) return null;
    return meta;
  }

  private generateKey(
    userId: string,
    originalName: string,
    folder?: string,
  ): string {
    const ts = Date.now();
    const hash = createHash("sha256")
      .update(`${userId}:${originalName}:${ts}`)
      .digest("hex")
      .slice(0, 8);
    const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return folder
      ? `${userId}/${folder}/${hash}-${safe}`
      : `${userId}/${hash}-${safe}`;
  }

  private addToHashIndex(hash: string, key: string): void {
    const keys = this.contentHashIndex.get(hash) ?? [];
    keys.push(key);
    this.contentHashIndex.set(hash, keys);
  }

  private async loadIndex(): Promise<void> {
    try {
      const raw = await fs.readFile(INDEX_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      this.fileIndex = new Map(
        Object.entries(parsed.fileIndex ?? {}).map(([k, v]: [string, any]) => [
          k,
          {
            ...v,
            lastAccessed: new Date(v.lastAccessed),
            createdAt: new Date(v.createdAt),
          },
        ]),
      );
      this.contentHashIndex = new Map(
        Object.entries(parsed.contentHashIndex ?? {}),
      );
    } catch {
      // Fresh index
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      await fs.mkdir("./data", { recursive: true });
      await fs.writeFile(
        INDEX_PATH,
        JSON.stringify({
          fileIndex: Object.fromEntries(this.fileIndex),
          contentHashIndex: Object.fromEntries(this.contentHashIndex),
        }),
        "utf-8",
      );
    } catch (err) {
      logger.warn("[HybridStorage] Failed to persist index:", err);
    }
  }
}

export const hybridStorageService = HybridStorageService.getInstance();
