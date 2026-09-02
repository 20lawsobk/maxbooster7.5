/**
 * Storage Service — Abstraction layer for file storage.
 *
 * Backend priority:
 *   1. Replit Object Storage (hot tier, if sidecar is available)
 *   2. Pocket Dimension (gzip + dedup, always available)
 *   3. Local filesystem fallback (development)
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import { pocketManager } from "../pocket-dimension/index.js";

const LOCAL_UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";
const POCKET_NAME = "storage-service-files";

// ── Interface ──────────────────────────────────────────────────────────────

export interface StorageProvider {
  uploadFile(file: Buffer, key: string, contentType?: string): Promise<string>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  fileExists(key: string): Promise<boolean>;
}

// ── Local Filesystem ───────────────────────────────────────────────────────

class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseDir = LOCAL_UPLOADS_DIR) {}

  private fullPath(key: string) {
    return path.join(this.baseDir, key);
  }

  async uploadFile(file: Buffer, key: string): Promise<string> {
    const p = this.fullPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, file);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(key));
  }

  async deleteFile(key: string): Promise<void> {
    await fs.unlink(this.fullPath(key)).catch(() => {});
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `file://${this.fullPath(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    return fs
      .access(this.fullPath(key))
      .then(() => true)
      .catch(() => false);
  }
}

// ── Pocket Dimension ───────────────────────────────────────────────────────

class PocketDimensionStorageProvider implements StorageProvider {
  private pocket: Awaited<ReturnType<typeof pocketManager.openPocket>> | null =
    null;
  private initPromise: Promise<void> | null = null;

  private async ensureOpen(): Promise<void> {
    if (this.pocket) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = pocketManager
      .openPocket(POCKET_NAME, {
        compressionLevel: 9,
        enableDeduplication: true,
      })
      .then((p) => {
        this.pocket = p;
      });
    return this.initPromise;
  }

  async uploadFile(file: Buffer, key: string): Promise<string> {
    await this.ensureOpen();
    await this.pocket!.write(key, file);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    await this.ensureOpen();
    const data = await this.pocket!.read(key);
    if (!data) throw new Error(`Key not found: ${key}`);
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  async deleteFile(key: string): Promise<void> {
    await this.ensureOpen();
    await this.pocket!.delete(key).catch(() => {});
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `/api/storage/download/${encodeURIComponent(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    await this.ensureOpen();
    return (this.pocket! as any)[key].exists() as boolean;
  }
}

// ── Replit Object Storage ─────────────────────────────────────────────────

class ReplitStorageProvider implements StorageProvider {
  private client: any = null;

  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    const probe = await fetch(
      "http://127.0.0.1:1106/object-storage/default-bucket",
      {
        signal: AbortSignal.timeout(600),
      },
    ).catch(() => null);

    if (!probe || !probe.ok) {
      throw new Error("Replit Object Storage sidecar not reachable");
    }

    const { Client } = await import("@replit/object-storage");
    const bucketId =
      process.env.REPLIT_BUCKET_ID ??
      process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    this.client = new Client(bucketId ? { bucketId } : undefined);
    return this.client;
  }

  async uploadFile(
    file: Buffer,
    key: string,
    contentType?: string,
  ): Promise<string> {
    const client = await this.getClient();
    const { ok, error } = await client.uploadFromBytes(
      key,
      file,
      contentType ? { contentType } : undefined,
    );
    if (!ok) throw new Error(`Replit upload failed: ${error}`);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    const client = await this.getClient();
    const { ok, value, error } = await client.downloadAsBytes(key);
    if (!ok) throw new Error(`Replit download failed: ${error}`);
    return Buffer.from(value as Uint8Array);
  }

  async deleteFile(key: string): Promise<void> {
    const client = await this.getClient();
    await client.delete(key);
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `/api/storage/download/${encodeURIComponent(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { ok } = await client.downloadAsBytes(key);
      return ok;
    } catch {
      return false;
    }
  }
}

// ── Hybrid (Replit hot + PD cold) ─────────────────────────────────────────

class HybridStorageProvider implements StorageProvider {
  private hot: ReplitStorageProvider;
  private cold: PocketDimensionStorageProvider;

  constructor() {
    this.hot = new ReplitStorageProvider();
    this.cold = new PocketDimensionStorageProvider();
  }

  async uploadFile(
    file: Buffer,
    key: string,
    contentType?: string,
  ): Promise<string> {
    try {
      return await this.hot.uploadFile(file, key, contentType);
    } catch {
      return this.cold.uploadFile(file, key);
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      return await this.hot.downloadFile(key);
    } catch {
      return this.cold.downloadFile(key);
    }
  }

  async deleteFile(key: string): Promise<void> {
    await Promise.allSettled([
      this.hot.deleteFile(key),
      this.cold.deleteFile(key),
    ]);
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `/api/storage/download/${encodeURIComponent(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    return (
      (await this.hot.fileExists(key)) || (await this.cold.fileExists(key))
    );
  }
}

// ── StorageService facade ─────────────────────────────────────────────────

class StorageService {
  private provider: StorageProvider;

  constructor() {
    const prov = (process.env.STORAGE_PROVIDER ?? "pocket").toLowerCase();
    if (prov === "hybrid" || prov === "replit") {
      logger.info(
        "[Storage] Using Hybrid provider (Replit hot + Pocket Dimension cold)",
      );
      this.provider = new HybridStorageProvider();
    } else if (prov === "local") {
      logger.info("[Storage] Using Local filesystem provider");
      this.provider = new LocalStorageProvider();
    } else {
      logger.info(
        "[Storage] Using Pocket Dimension provider (level-9 gzip, dedup)",
      );
      this.provider = new PocketDimensionStorageProvider();
    }
  }

  async uploadFile(
    file: Buffer,
    category: string,
    filename: string,
    contentType?: string,
  ): Promise<string> {
    const key = `${category}/${randomUUID()}/${filename}`;
    await this.provider.uploadFile(file, key, contentType);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    return this.provider.downloadFile(key);
  }

  async deleteFile(key: string): Promise<void> {
    return this.provider.deleteFile(key);
  }

  async getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    return this.provider.getDownloadUrl(key, expiresIn);
  }

  async fileExists(key: string): Promise<boolean> {
    return this.provider.fileExists(key);
  }

  /** Schedule deletion after ttlMs milliseconds. */
  deleteWithTTL(key: string, ttlMs: number): void {
    setTimeout(() => {
      this.deleteFile(key).catch((err) =>
        logger.warn(`[Storage] TTL delete failed for ${key}:`, err),
      );
    }, ttlMs);
  }
}

export const storageService = new StorageService();
export {
  LocalStorageProvider,
  PocketDimensionStorageProvider,
  ReplitStorageProvider,
};
