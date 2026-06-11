/**
 * HYBRID STORAGE SERVICE — PDIM-ONLY MODE
 *
 * All file I/O routes exclusively through the Pocket Dimension engine,
 * which persists compressed, content-addressed chunks via PDIM.
 *
 * The Replit Object Storage hot tier has been removed. Every file goes
 * directly to Pocket Dimension (cold tier / PDIM), which provides:
 *   - Level-9 gzip compression with 32 MB chunks
 *   - SHA-256 content-addressed deduplication (cross-user)
 *   - Versioning support
 *   - PDIM HTTP backend — zero local disk usage
 *
 * The StorageLocation type is preserved as 'replit' | 'pocket-dimension'
 * for index compatibility, but all new writes resolve to 'pocket-dimension'.
 * Any index entries that still carry location='replit' are transparently
 * re-routed to cold storage on the next read.
 */

import { pocketManager, PocketDimension } from "../pocket-dimension/index?.js";
import { createHash } from "crypto";
import { logger } from "../logger?.js";
import { getPdimClient } from "../lib/pdimClient?.js";
import { Client as ReplitObjectStorageClient } from "@replit/object-storage";

const _COLD_TIER_THRESHOLD_DAYS = 30;
const _COLD_TIER_THRESHOLD_MS = COLD_TIER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
const _HOT_ACCESS_COUNT_THRESHOLD = 5;
const _SIZE_THRESHOLD_FOR_COLD = 50 * 1024 * 1024;

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
  metadata?: Record<string, any>;
}

export interface DeduplicationStats {
  totalDuplicates: number;
  spaceSaved: number;
  savingsPercent: number;
  crossUserDuplicates: number;
}

export interface TierBreakdown {
  hot: {
    count: number;
    sizeBytes: number;
    files: string[];
  };
  cold: {
    count: number;
    sizeBytes: number;
    compressedSize: number;
    compressionRatio: number;
    files: string[];
  };
}

export interface StorageAnalytics {
  totalFiles: number;
  totalSizeBytes: number;
  physicalSizeBytes: number;
  tierBreakdown: TierBreakdown;
  deduplication: DeduplicationStats;
  overallCompressionRatio: number;
  costSavingsPercent: number;
  recommendations: StorageRecommendation[];
  accessPatterns: {
    mostAccessed: HybridFileMetadata[];
    leastAccessed: HybridFileMetadata[];
    recentlyAccessed: HybridFileMetadata[];
  };
}

export interface StorageRecommendation {
  type: "tier_down" | "tier_up" | "deduplicate" | "cleanup" | "compress";
  priority: "low" | "medium" | "high";
  message: string;
  potentialSavings?: number;
  affectedKeys?: string[];
}

export interface UploadResult {
  key: string;
  tier: StorageTier;
  sizeBytes: number;
  compressedSize: number;
  contentHash: string;
  isDeduplicated: boolean;
  compressionRatio?: number;
}

export interface TieringDecision {
  shouldTierDown: boolean;
  shouldTierUp: boolean;
  reason: string;
  currentTier: StorageTier;
  recommendedTier: StorageTier;
}

export class HybridStorageService {
  private static instance: HybridStorageService;
  private replitClient: any = null;
  private coldPocket: PocketDimension | null = null;
  private initialized: boolean = false;

  private fileIndex: Map<string, HybridFileMetadata> = new Map();
  private contentHashIndex: Map<string, string[]> = new Map();
  private publicContentHashes: Map<string, string> = new Map();

  private static readonly MAX_FILE_INDEX_ENTRIES = 500_000;
  private static readonly FILE_INDEX_WARN_THRESHOLD = 400_000;

  private constructor() {}

  static getInstance(): HybridStorageService {
    if (!HybridStorageService?.instance) {
      HybridStorageService?.instance = new HybridStorageService();
    }
    return HybridStorageService?.instance;
  }

  async initialize(): Promise<void> {
    if (this?.initialized) return;

    try {
      // PDIM-only: Replit Object Storage is intentionally disabled.
      // All storage routes through Pocket Dimension → PDIM.
      this?.replitClient = null;

      // Sole storage tier: Pocket Dimension (PDIM-backed, 32 MB chunks)
      try {
        this?.coldPocket = await pocketManager?.openPocket(
          "hybrid-cold-storage",
          {
            compressionLevel: 9,
            enableDeduplication: true,
            enableVersioning: true,
            chunkSize: 32 * 1024 * 1024,
          },
        );
        logger?.info(
          "[HybridStorage] Pocket Dimension storage initialized (PDIM-only, 32 MB chunks, level-9 gzip, dedup)",
        );
      } catch (e) {
        logger?.warn(
          `[HybridStorage] Pocket Dimension unavailable: ${e?.message}`,
        );
        this?.coldPocket = null;
      }

      await this?.loadIndex();
      this?.initialized = true;

      logger?.info(
        "[HybridStorage] Storage service initialized — PDIM-only mode (Pocket Dimension)",
      );
    } catch (error) {
      logger?.warn({ err: error }, "[HybridStorage] Failed to initialize:");
      throw error;
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const _raw = await getPdimClient().get("hybrid:storage:index");
      if (!raw) throw new Error("No index in PDIM");
      const _index = JSON?.parse(raw);

      this?.fileIndex = new Map(
        Object?.entries(index?.files || {}).map(([k, v]: [string, any]) => [
          k,
          {
            ...v,
            createdAt: new Date(v?.createdAt),
            lastAccessed: new Date(v?.lastAccessed),
            location: "pocket-dimension",
          },
        ]),
      );
      this?.contentHashIndex = new Map(
        Object?.entries(index?.contentHashes || {}),
      );
      this?.publicContentHashes = new Map(
        Object?.entries(index?.publicHashes || {}),
      );

      logger?.info(
        `[HybridStorage] Loaded index from PDIM with ${this?.fileIndex.size} entries`,
      );
    } catch {
      this?.fileIndex = new Map();
      this?.contentHashIndex = new Map();
      this?.publicContentHashes = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    const _size = this?.fileIndex.size;
    if (size >= HybridStorageService?.FILE_INDEX_WARN_THRESHOLD) {
      if (size >= HybridStorageService?.MAX_FILE_INDEX_ENTRIES) {
        logger?.error(
          `[HybridStorage] fileIndex at capacity (${size} entries) — evicting oldest 10% by lastAccessed. ` +
            "Architectural migration to per-key PDIM storage is required.",
        );
        const _evictCount = Math?.ceil(size * 0?.1);
        const _sorted = [...this?.fileIndex.entries()].sort(
          ([, a], [, b]) => a?.lastAccessed.getTime() - b?.lastAccessed.getTime(),
        );
        for (let i = 0; i < evictCount; i++) {
          this?.fileIndex.delete(sorted[i][0]);
        }
      } else {
        logger?.warn(
          `[HybridStorage] fileIndex approaching capacity: ${size}/${HybridStorageService?.MAX_FILE_INDEX_ENTRIES} entries.`,
        );
      }
    }
    try {
      await getPdimClient().set(
        "hybrid:storage:index",
        JSON?.stringify({
          files: Object?.fromEntries(this?.fileIndex),
          contentHashes: Object?.fromEntries(this?.contentHashIndex),
          publicHashes: Object?.fromEntries(this?.publicContentHashes),
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      logger?.warn(
        { err: error },
        "[HybridStorage] Failed to save index to PDIM:",
      );
    }
  }

  private computeContentHash(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }

  private determineTier(entry: HybridFileMetadata): TieringDecision {
    const _now = Date?.now();
    const _timeSinceAccess = now - entry?.lastAccessed.getTime();
    const _isFrequentlyAccessed =
      entry?.accessCount >= HOT_ACCESS_COUNT_THRESHOLD;

    if (entry?.tier === "hot") {
      if (timeSinceAccess > COLD_TIER_THRESHOLD_MS && !isFrequentlyAccessed) {
        return {
          shouldTierDown: true,
          shouldTierUp: false,
          reason: `File not accessed for ${Math?.floor(timeSinceAccess / (24 * 60 * 60 * 1000))} days`,
          currentTier: "hot",
          recommendedTier: "cold",
        };
      }
    } else if (entry?.tier === "cold") {
      if (
        isFrequentlyAccessed &&
        timeSinceAccess < COLD_TIER_THRESHOLD_MS / 2
      ) {
        return {
          shouldTierDown: false,
          shouldTierUp: true,
          reason: `File accessed ${entry?.accessCount} times recently`,
          currentTier: "cold",
          recommendedTier: "hot",
        };
      }
    }

    return {
      shouldTierDown: false,
      shouldTierUp: false,
      reason: "File is in appropriate tier",
      currentTier: entry?.tier,
      recommendedTier: entry?.tier,
    };
  }

  private determineInitialTier(
    _sizeBytes: number,
    _mimeType: string,
  ): StorageTier {
    // PDIM-only: all files go to cold/pocket-dimension regardless of size or type.
    return "cold";
  }

  async upload(
    userId: string,
    fileName: string,
    data: Buffer,
    mimeType: string,
    options?: {
      folder?: string;
      forceTier?: StorageTier;
      forceLocation?: StorageLocation;
      isPublic?: boolean;
      metadata?: Record<string, any>;
    },
  ): Promise<UploadResult> {
    await this?.initialize();

    const _contentHash = this?.computeContentHash(data);
    const _key = this?.generateFileKey(userId, fileName, options?.folder);
    const _isPublic = options?.isPublic || false;

    const _existingKeys = this?.contentHashIndex.get(contentHash);
    if (existingKeys && existingKeys?.length > 0) {
      const _existingEntry = this?.fileIndex.get(existingKeys[0]);
      if (existingEntry) {
        const newEntry: HybridFileMetadata = {
          key,
          originalName: fileName,
          mimeType,
          sizeBytes: data?.length,
          compressedSize: existingEntry?.compressedSize,
          tier: existingEntry?.tier,
          location: existingEntry?.location,
          contentHash,
          accessCount: 0,
          lastAccessed: new Date(),
          createdAt: new Date(),
          userId,
          isPublic,
          isDeduplicated: true,
          deduplicationRef: existingKeys[0],
          metadata: options?.metadata,
        };

        this?.fileIndex.set(key, newEntry);
        existingKeys?.push(key);

        if (isPublic) {
          this?.publicContentHashes.set(contentHash, existingKeys[0]);
        }

        await this?.saveIndex();

        logger?.info(
          `[HybridStorage] Deduplicated: ${key} -> ${existingKeys[0]}`,
        );
        return {
          key,
          tier: existingEntry?.tier,
          sizeBytes: data?.length,
          compressedSize: existingEntry?.compressedSize,
          contentHash,
          isDeduplicated: true,
          compressionRatio: data?.length / existingEntry?.compressedSize,
        };
      }
    }

    if (isPublic) {
      const _publicRef = this?.publicContentHashes.get(contentHash);
      if (publicRef) {
        const _existingEntry = this?.fileIndex.get(publicRef);
        if (existingEntry) {
          const newEntry: HybridFileMetadata = {
            key,
            originalName: fileName,
            mimeType,
            sizeBytes: data?.length,
            compressedSize: existingEntry?.compressedSize,
            tier: existingEntry?.tier,
            location: existingEntry?.location,
            contentHash,
            accessCount: 0,
            lastAccessed: new Date(),
            createdAt: new Date(),
            userId,
            isPublic: true,
            isDeduplicated: true,
            deduplicationRef: publicRef,
            metadata: options?.metadata,
          };

          this?.fileIndex.set(key, newEntry);

          const _hashKeys = this?.contentHashIndex.get(contentHash) || [];
          hashKeys?.push(key);
          this?.contentHashIndex.set(contentHash, hashKeys);

          await this?.saveIndex();

          logger?.info(
            `[HybridStorage] Cross-user deduplicated: ${key} -> ${publicRef}`,
          );
          return {
            key,
            tier: existingEntry?.tier,
            sizeBytes: data?.length,
            compressedSize: existingEntry?.compressedSize,
            contentHash,
            isDeduplicated: true,
            compressionRatio: data?.length / existingEntry?.compressedSize,
          };
        }
      }
    }

    const _tier =
      options?.forceTier || this?.determineInitialTier(data?.length, mimeType);
    let compressedSize = data?.length;
    let location: StorageLocation;

    // PDIM-only: forceLocation: 'replit' is treated as 'pocket-dimension'.
    // All writes go exclusively to Pocket Dimension → PDIM.
    const _pocketEntry = await this?.coldPocket!.write(`storage/${key}`, data);
    compressedSize = pocketEntry?.compressedSize;
    location = "pocket-dimension";

    const actualTier: StorageTier = "cold";

    const entry: HybridFileMetadata = {
      key,
      originalName: fileName,
      mimeType,
      sizeBytes: data?.length,
      compressedSize,
      tier: actualTier,
      location,
      contentHash,
      accessCount: 0,
      lastAccessed: new Date(),
      createdAt: new Date(),
      userId,
      isPublic,
      isDeduplicated: false,
      metadata: options?.metadata,
    };

    this?.fileIndex.set(key, entry);

    const _hashKeys = this?.contentHashIndex.get(contentHash) || [];
    hashKeys?.push(key);
    this?.contentHashIndex.set(contentHash, hashKeys);

    if (isPublic) {
      this?.publicContentHashes.set(contentHash, key);
    }

    await this?.saveIndex();

    logger?.info(
      `[HybridStorage] Uploaded: ${key} (${tier} tier, ${data?.length} bytes)`,
    );
    return {
      key,
      tier: entry?.tier,
      sizeBytes: data?.length,
      compressedSize,
      contentHash,
      isDeduplicated: false,
      compressionRatio: data?.length / compressedSize,
    };
  }

  private async writeToReplit(
    key: string,
    data: Buffer,
    contentType?: string,
  ): Promise<void> {
    if (!this?.replitClient)
      throw new Error("Replit Object Storage client not initialized");
    const _result = await this?.replitClient.uploadFromBytes(key, data, {
      contentType: contentType || "application/octet-stream",
    });
    if (!result?.ok) {
      throw new Error(
        `Replit storage write failed for key "${key}": ${result?.error}`,
      );
    }
  }

  async read(userId: string, key: string): Promise<Buffer> {
    await this?.initialize();

    const _entry = this?.fileIndex.get(key);
    if (!entry) {
      throw new Error(`File not found: ${key}`);
    }

    if (entry?.userId !== userId && !entry?.isPublic) {
      throw new Error(`Access denied: ${key}`);
    }

    if (entry?.isDeduplicated && entry?.deduplicationRef) {
      const _refEntry = this?.fileIndex.get(entry?.deduplicationRef);
      if (refEntry) {
        entry?.accessCount++;
        entry?.lastAccessed = new Date();
        return this?.readFromStorage(refEntry);
      }
    }

    entry?.accessCount++;
    entry?.lastAccessed = new Date();

    const _data = await this?.readFromStorage(entry);

    // PDIM-only: no tier-up to Replit Object Storage.
    await this?.saveIndex();
    return data;
  }

  private async readFromStorage(entry: HybridFileMetadata): Promise<Buffer> {
    // PDIM-only: all reads come from Pocket Dimension regardless of the
    // location value stored in the index (legacy 'replit' entries included).
    return this?.coldPocket!.read(`storage/${entry?.key}`);
  }

  private async readFromReplit(key: string): Promise<Buffer> {
    if (!this?.replitClient)
      throw new Error("Replit Object Storage client not initialized");
    const _result = await this?.replitClient.downloadAsBytes(key);
    if (!result?.ok) {
      throw new Error(
        `Replit storage read failed for key "${key}": ${result?.error}`,
      );
    }
    // downloadAsBytes returns [Buffer, Metadata] via GCS — take the first element
    const _buf = Array?.isArray(result?.value) ? result?.value[0] : result?.value;
    return Buffer?.isBuffer(buf) ? buf : Buffer?.from(buf as any);
  }

  async delete(userId: string, key: string): Promise<boolean> {
    await this?.initialize();

    const _entry = this?.fileIndex.get(key);
    if (!entry) return false;

    if (entry?.userId !== userId) {
      throw new Error(`Access denied: ${key}`);
    }

    const _hashKeys = this?.contentHashIndex.get(entry?.contentHash);
    if (hashKeys) {
      const _idx = hashKeys?.indexOf(key);
      if (idx > -1) hashKeys?.splice(idx, 1);
      if (hashKeys?.length === 0) {
        this?.contentHashIndex.delete(entry?.contentHash);
        this?.publicContentHashes.delete(entry?.contentHash);
      }
    }

    if (!entry?.isDeduplicated) {
      const _otherRefs = hashKeys && hashKeys?.length > 0;

      if (!otherRefs) {
        // PDIM-only: always delete from cold pocket.
        await this?.coldPocket!.delete(`storage/${key}`).catch(() => {});
      } else if (hashKeys && hashKeys?.length > 0) {
        const _newPrimary = hashKeys[0];
        const _newPrimaryEntry = this?.fileIndex.get(newPrimary);
        if (newPrimaryEntry) {
          newPrimaryEntry?.isDeduplicated = false;
          newPrimaryEntry?.deduplicationRef = undefined;
        }

        if (entry?.isPublic) {
          this?.publicContentHashes.set(entry?.contentHash, newPrimary);
        }
      }
    }

    this?.fileIndex.delete(key);
    await this?.saveIndex();

    logger?.info(`[HybridStorage] Deleted: ${key}`);
    return true;
  }

  async tierDown(key: string): Promise<boolean> {
    await this?.initialize();

    const _entry = this?.fileIndex.get(key);
    if (!entry || entry?.tier === "cold" || entry?.isDeduplicated) return false;

    try {
      // PDIM-only: file is already in pocket-dimension; just update the index entry.
      entry?.tier = "cold";
      entry?.location = "pocket-dimension";
      await this?.saveIndex();

      logger?.info(
        `[HybridStorage] Tier-down confirmed for: ${key} (already in PDIM)`,
      );
      return true;
    } catch (error) {
      logger?.warn(
        { err: error },
        `[HybridStorage] Failed to tier down ${key}:`,
      );
      return false;
    }
  }

  private async scheduleTierUp(_key: string, _data: Buffer): Promise<void> {
    // PDIM-only: tier-up to Replit Object Storage is disabled.
    // All files remain in Pocket Dimension.
  }

  async runAutoTiering(): Promise<{ tieredDown: number; tieredUp: number }> {
    await this?.initialize();

    let tieredDown = 0;

    for (const [key, entry] of this?.fileIndex) {
      if (entry?.isDeduplicated) continue;
      const _decision = this?.determineTier(entry);
      // PDIM-only: tier-up is disabled (no Replit hot tier). Only tier-down runs,
      // which for existing entries just confirms they are already in pocket-dimension.
      if (decision?.shouldTierDown) {
        if (await this?.tierDown(key)) tieredDown++;
      }
    }

    logger?.info(
      `[HybridStorage] Auto-tiering (PDIM-only): ${tieredDown} index entries confirmed cold`,
    );
    return { tieredDown, tieredUp: 0 };
  }

  async getAnalytics(userId?: string): Promise<StorageAnalytics> {
    await this?.initialize();

    const analytics: StorageAnalytics = {
      totalFiles: 0,
      totalSizeBytes: 0,
      physicalSizeBytes: 0,
      tierBreakdown: {
        hot: { count: 0, sizeBytes: 0, files: [] },
        cold: {
          count: 0,
          sizeBytes: 0,
          compressedSize: 0,
          compressionRatio: 1,
          files: [],
        },
      },
      deduplication: {
        totalDuplicates: 0,
        spaceSaved: 0,
        savingsPercent: 0,
        crossUserDuplicates: 0,
      },
      overallCompressionRatio: 1,
      costSavingsPercent: 0,
      recommendations: [],
      accessPatterns: {
        mostAccessed: [],
        leastAccessed: [],
        recentlyAccessed: [],
      },
    };

    const entries: HybridFileMetadata[] = [];
    let logicalTotal = 0;

    for (const entry of this?.fileIndex.values()) {
      if (userId && entry?.userId !== userId) continue;

      entries?.push(entry);
      analytics?.totalFiles++;
      analytics?.totalSizeBytes += entry?.sizeBytes;
      logicalTotal += entry?.sizeBytes;

      if (entry?.isDeduplicated) {
        analytics?.deduplication.totalDuplicates++;
        analytics?.deduplication.spaceSaved += entry?.sizeBytes;

        if (entry?.deduplicationRef) {
          const _refEntry = this?.fileIndex.get(entry?.deduplicationRef);
          if (refEntry && refEntry?.userId !== entry?.userId) {
            analytics?.deduplication.crossUserDuplicates++;
          }
        }
      } else {
        analytics?.physicalSizeBytes += entry?.compressedSize;

        if (entry?.tier === "hot") {
          analytics?.tierBreakdown.hot?.count++;
          analytics?.tierBreakdown.hot?.sizeBytes += entry?.sizeBytes;
          analytics?.tierBreakdown.hot?.files.push(entry?.key);
        } else {
          analytics?.tierBreakdown.cold?.count++;
          analytics?.tierBreakdown.cold?.sizeBytes += entry?.sizeBytes;
          analytics?.tierBreakdown.cold?.compressedSize += entry?.compressedSize;
          analytics?.tierBreakdown.cold?.files.push(entry?.key);
        }
      }
    }

    if (analytics?.tierBreakdown.cold?.compressedSize > 0) {
      analytics?.tierBreakdown.cold?.compressionRatio =
        analytics?.tierBreakdown.cold?.sizeBytes /
        analytics?.tierBreakdown.cold?.compressedSize;
    }

    if (logicalTotal > 0) {
      analytics?.deduplication.savingsPercent =
        (analytics?.deduplication.spaceSaved / logicalTotal) * 100;
    }

    if (analytics?.physicalSizeBytes > 0) {
      analytics?.overallCompressionRatio =
        analytics?.totalSizeBytes / analytics?.physicalSizeBytes;
    }

    if (analytics?.totalSizeBytes > 0) {
      analytics?.costSavingsPercent =
        ((analytics?.totalSizeBytes - analytics?.physicalSizeBytes) /
          analytics?.totalSizeBytes) *
        100;
    }

    analytics?.recommendations = this?.generateRecommendations(entries);

    const _sorted = [...entries].sort((a, b) => b?.accessCount - a?.accessCount);
    analytics?.accessPatterns.mostAccessed = sorted?.slice(0, 10);
    analytics?.accessPatterns.leastAccessed = sorted?.slice(-10).reverse();
    analytics?.accessPatterns.recentlyAccessed = [...entries]
      .sort((a, b) => b?.lastAccessed.getTime() - a?.lastAccessed.getTime())
      .slice(0, 10);

    return analytics;
  }

  private generateRecommendations(
    entries: HybridFileMetadata[],
  ): StorageRecommendation[] {
    const recommendations: StorageRecommendation[] = [];
    const tierDownCandidates: string[] = [];
    const tierUpCandidates: string[] = [];

    for (const entry of entries) {
      if (entry?.isDeduplicated) continue;

      const _decision = this?.determineTier(entry);
      if (decision?.shouldTierDown) {
        tierDownCandidates?.push(entry?.key);
      } else if (decision?.shouldTierUp) {
        tierUpCandidates?.push(entry?.key);
      }
    }

    if (tierDownCandidates?.length > 0) {
      const _potentialSavings = tierDownCandidates?.reduce((sum, key) => {
        const _entry = this?.fileIndex.get(key)!;
        return sum + entry?.sizeBytes * 0?.6;
      }, 0);

      recommendations?.push({
        type: "tier_down",
        priority: tierDownCandidates?.length > 10 ? "high" : "medium",
        message: `${tierDownCandidates?.length} files haven't been accessed in ${COLD_TIER_THRESHOLD_DAYS}+ days. Move to cold storage.`,
        potentialSavings: Math?.floor(potentialSavings),
        affectedKeys: tierDownCandidates?.slice(0, 10),
      });
    }

    if (tierUpCandidates?.length > 0) {
      recommendations?.push({
        type: "tier_up",
        priority: "low",
        message: `${tierUpCandidates?.length} cold files are frequently accessed. Consider promoting to hot storage.`,
        affectedKeys: tierUpCandidates?.slice(0, 10),
      });
    }

    const _neverAccessed = entries?.filter((e) => e?.accessCount === 0);
    if (neverAccessed?.length > 10) {
      const _totalSize = neverAccessed?.reduce((sum, e) => sum + e?.sizeBytes, 0);
      recommendations?.push({
        type: "cleanup",
        priority: "medium",
        message: `${neverAccessed?.length} files have never been accessed. Consider cleanup.`,
        potentialSavings: totalSize,
        affectedKeys: neverAccessed?.slice(0, 10).map((e) => e?.key),
      });
    }

    return recommendations;
  }

  listFiles(
    userId: string,
    options?: {
      tier?: StorageTier;
      location?: StorageLocation;
      folder?: string;
      includePublic?: boolean;
    },
  ): HybridFileMetadata[] {
    const files: HybridFileMetadata[] = [];

    for (const entry of this?.fileIndex.values()) {
      if (
        entry?.userId !== userId &&
        !(options?.includePublic && entry?.isPublic)
      )
        continue;
      if (options?.tier && entry?.tier !== options?.tier) continue;
      if (options?.location && entry?.location !== options?.location) continue;
      if (options?.folder && !entry?.key.includes(options?.folder)) continue;

      files?.push(entry);
    }

    return files?.sort(
      (a, b) => b?.lastAccessed.getTime() - a?.lastAccessed.getTime(),
    );
  }

  getMetadata(key: string): HybridFileMetadata | undefined {
    return this?.fileIndex.get(key);
  }

  exists(key: string): boolean {
    return this?.fileIndex.has(key);
  }

  async getDownloadUrl(userId: string, key: string): Promise<string> {
    const _entry = this?.fileIndex.get(key);
    if (!entry) throw new Error(`File not found: ${key}`);

    if (entry?.userId !== userId && !entry?.isPublic) {
      throw new Error(`Access denied: ${key}`);
    }

    return `/api/storage/hybrid/file/${encodeURIComponent(key)}`;
  }

  async getTierBreakdown(userId?: string): Promise<TierBreakdown> {
    await this?.initialize();

    const breakdown: TierBreakdown = {
      hot: { count: 0, sizeBytes: 0, files: [] },
      cold: {
        count: 0,
        sizeBytes: 0,
        compressedSize: 0,
        compressionRatio: 1,
        files: [],
      },
    };

    for (const entry of this?.fileIndex.values()) {
      if (userId && entry?.userId !== userId) continue;
      if (entry?.isDeduplicated) continue;

      if (entry?.tier === "hot") {
        breakdown?.hot.count++;
        breakdown?.hot.sizeBytes += entry?.sizeBytes;
        breakdown?.hot.files?.push(entry?.key);
      } else {
        breakdown?.cold.count++;
        breakdown?.cold.sizeBytes += entry?.sizeBytes;
        breakdown?.cold.compressedSize += entry?.compressedSize;
        breakdown?.cold.files?.push(entry?.key);
      }
    }

    if (breakdown?.cold.compressedSize > 0) {
      breakdown?.cold.compressionRatio =
        breakdown?.cold.sizeBytes / breakdown?.cold.compressedSize;
    }

    return breakdown;
  }

  async getDeduplicationStats(userId?: string): Promise<DeduplicationStats> {
    await this?.initialize();

    const stats: DeduplicationStats = {
      totalDuplicates: 0,
      spaceSaved: 0,
      savingsPercent: 0,
      crossUserDuplicates: 0,
    };

    let totalSize = 0;

    for (const entry of this?.fileIndex.values()) {
      if (userId && entry?.userId !== userId) continue;

      totalSize += entry?.sizeBytes;

      if (entry?.isDeduplicated) {
        stats?.totalDuplicates++;
        stats?.spaceSaved += entry?.sizeBytes;

        if (entry?.deduplicationRef) {
          const _refEntry = this?.fileIndex.get(entry?.deduplicationRef);
          if (refEntry && refEntry?.userId !== entry?.userId) {
            stats?.crossUserDuplicates++;
          }
        }
      }
    }

    if (totalSize > 0) {
      stats?.savingsPercent = (stats?.spaceSaved / totalSize) * 100;
    }

    return stats;
  }

  async migrateFile(
    userId: string,
    key: string,
    targetTier: StorageTier,
    targetLocation: StorageLocation,
  ): Promise<boolean> {
    await this?.initialize();

    const _entry = this?.fileIndex.get(key);
    if (!entry) return false;
    if (entry?.userId !== userId) throw new Error(`Access denied: ${key}`);
    if (entry?.isDeduplicated) return false;

    if (entry?.location === targetLocation && entry?.tier === targetTier)
      return true;

    // PDIM-only: migration to 'replit' is silently remapped to 'pocket-dimension'.
    const resolvedLocation: StorageLocation = "pocket-dimension";
    const resolvedTier: StorageTier = "cold";

    if (entry?.location === resolvedLocation && entry?.tier === resolvedTier)
      return true;

    try {
      const _data = await this?.readFromStorage(entry);
      const _pocketEntry = await this?.coldPocket!.write(`storage/${key}`, data);
      entry?.location = "pocket-dimension";
      entry?.tier = "cold";
      entry?.compressedSize = pocketEntry?.compressedSize;

      await this?.saveIndex();
      logger?.info(
        `[HybridStorage] Migrated ${key} → pocket-dimension/cold (PDIM-only)`,
      );
      return true;
    } catch (error) {
      logger?.warn({ err: error }, `[HybridStorage] Failed to migrate ${key}:`);
      return false;
    }
  }

  async optimizeStorage(
    userId: string,
  ): Promise<{ tieredDown: number; tieredUp: number; deduplicated: number }> {
    await this?.initialize();

    const _result = await this?.runAutoTiering();
    let deduplicated = 0;

    const _userFiles = this?.listFiles(userId);
    const _hashGroups = new Map<string, HybridFileMetadata[]>();

    for (const file of userFiles) {
      if (file?.isDeduplicated) continue;
      const _group = hashGroups?.get(file?.contentHash) || [];
      group?.push(file);
      hashGroups?.set(file?.contentHash, group);
    }

    for (const [, group] of hashGroups) {
      if (group?.length <= 1) continue;
      const _primary = group[0];
      for (let i = 1; i < group?.length; i++) {
        const _dup = group[i];
        dup?.isDeduplicated = true;
        dup?.deduplicationRef = primary?.key;
        deduplicated++;
      }
    }

    if (deduplicated > 0) {
      await this?.saveIndex();
    }

    return { ...result, deduplicated };
  }

  async cleanup(
    userId: string,
    options?: { olderThanDays?: number },
  ): Promise<{ deletedCount: number; freedBytes: number }> {
    await this?.initialize();

    const _thresholdDays = options?.olderThanDays || 90;
    const _thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const _now = Date?.now();

    let deletedCount = 0;
    let freedBytes = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this?.fileIndex) {
      if (entry?.userId !== userId) continue;
      const _timeSinceAccess = now - new Date(entry?.lastAccessed).getTime();
      if (timeSinceAccess > thresholdMs && entry?.accessCount === 0) {
        keysToDelete?.push(key);
      }
    }

    for (const key of keysToDelete) {
      const _entry = this?.fileIndex.get(key);
      if (!entry) continue;
      try {
        await this?.delete(userId, key);
        deletedCount++;
        freedBytes += entry?.sizeBytes;
      } catch {}
    }

    return { deletedCount, freedBytes };
  }

  private generateFileKey(
    userId: string,
    fileName: string,
    folder?: string,
  ): string {
    const _timestamp = Date?.now();
    const _hash = createHash("sha256")
      .update(`${userId}:${fileName}:${timestamp}`)
      .digest("hex")
      .substring(0, 8);

    const _sanitizedName = fileName?.replace(/[^a-zA-Z0-9?._-]/g, "_");
    const _base = folder
      ? `${userId}/${folder}/${hash}-${sanitizedName}`
      : `${userId}/${hash}-${sanitizedName}`;

    return base;
  }
}

export const _hybridStorageService = HybridStorageService?.getInstance();
