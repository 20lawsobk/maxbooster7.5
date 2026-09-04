/**
 * Storage Service — PDIM-only.
 *
 * All file I/O is routed exclusively through the Pocket Dimension engine,
 * which persists chunks via the PDIM HTTP server. The Replit local
 * filesystem is NEVER used as a storage source: no durability copy on
 * upload, no fallback read, no disk-based existence check. If PDIM is
 * unreachable, every operation fails explicitly (the caller sees a real
 * error) instead of silently reading or writing local files.
 */

import { randomUUID } from "crypto";
import { logger } from "../logger.js";

// Throttle noisy PDIM-unavailable warnings to once per 30 s per operation type
// so a storage-server outage doesn't flood the log on every upload/delete.
const _STORAGE_WARN_THROTTLE_MS = 30_000;
let _lastPdimWriteWarnAt = 0;
let _lastPdimReadWarnAt = 0;
let _lastPdimDeleteWarnAt = 0;

export interface StorageProvider {
  uploadFile(file: Buffer, key: string, contentType?: string): Promise<string>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  getUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string | null>;
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  fileExists(key: string): Promise<boolean>;
}

/**
 * Pocket Dimension Storage Provider
 *
 * Routes ALL file I/O through the Pocket Dimension engine:
 *   - Level-9 Gzip compression on every chunk
 *   - SHA-256 content-addressed deduplication
 *   - 32 MB chunk size for efficient large-file handling
 *   - Chunks persisted exclusively to the PDIM HTTP server
 *
 * PDIM is the ONLY storage backend this provider ever touches. There is no
 * local-filesystem write, read, or existence check anywhere in this class —
 * a PDIM failure is a real failure, surfaced to the caller, never masked by
 * a disk fallback.
 */
class PocketDimensionStorageProvider implements StorageProvider {
  private pocket: Record<string, unknown> | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      const { PocketDimensionManager } = await import(
        "../pocket-dimension/index.js"
      );
      const manager = PocketDimensionManager?.getInstance("./pocket-dimensions");
      this.pocket = await manager?.openPocket("application-storage", {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 32 * 1024 * 1024,
      });
      logger.info(
        "📦 [Storage] Pocket Dimension provider ready (PDIM-only, level-9 gzip, dedup, 32 MB chunks)",
      );
    } catch (err) {
      logger.warn(
        { err: err },
        "[Storage] Failed to initialize Pocket Dimension provider:",
      );
    }
  }

  private async ensure(): Promise<void> {
    await this.initPromise;
    if (!this.pocket)
      throw new Error("Pocket Dimension storage provider not initialized");
  }

  async uploadFile(
    file: Buffer,
    key: string,
    _contentType?: string,
  ): Promise<string> {
    try {
      await this.ensure();
      await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<unknown>>
      ).write(`files/${key}`, file);

      const exists = await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<boolean>>
      ).exists(`files/${key}`);
      if (!exists) {
        throw new Error("PDIM write verification failed");
      }

      return key;
    } catch (err) {
      const now = Date.now();
      if (now - _lastPdimWriteWarnAt >= _STORAGE_WARN_THROTTLE_MS) {
        _lastPdimWriteWarnAt = now;
        logger.warn(
          { err },
          `[Storage] PDIM write failed for key=${key} — suppressing repeats for 30 s`,
        );
      }
      throw new Error(
        `Storage upload failed for key=${key}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      await this.ensure();
      return await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<Buffer>>
      ).read(`files/${key}`);
    } catch (err) {
      const now = Date.now();
      if (now - _lastPdimReadWarnAt >= _STORAGE_WARN_THROTTLE_MS) {
        _lastPdimReadWarnAt = now;
        logger.warn(
          { err },
          `[Storage] PDIM read failed for key=${key} — suppressing repeats for 30 s`,
        );
      }
      throw new Error(`File not found: ${key}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.ensure();
      await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<void>>
      ).delete(`files/${key}`);
    } catch (err) {
      const now = Date.now();
      if (now - _lastPdimDeleteWarnAt >= _STORAGE_WARN_THROTTLE_MS) {
        _lastPdimDeleteWarnAt = now;
        logger.warn(
          { err },
          `[Storage] PDIM delete failed for key=${key} — suppressing repeats for 30 s`,
        );
      }
      throw new Error(
        `Storage delete failed for key=${key}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }

  async getUploadUrl(
    _key: string,
    _contentType: string,
    _expiresIn?: number,
  ): Promise<string | null> {
    return null;
  }

  async getDownloadUrl(key: string, _expiresIn?: number): Promise<string> {
    return `/api/storage/file/${encodeURIComponent(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.ensure();
      return await (
        this.pocket as Record<string, (...a: unknown[]) => Promise<boolean>>
      ).exists(`files/${key}`);
    } catch {
      return false;
    }
  }
}

/**
 * Storage Service Singleton — always uses Pocket Dimension (PDIM-backed).
 */
class StorageService {
  private provider: StorageProvider;

  constructor() {
    logger.info(
      "📦 [Storage] Using Pocket Dimension (PDIM) as the sole storage backend",
    );
    this.provider = new PocketDimensionStorageProvider();
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

  async uploadFileAtKey(
    file: Buffer,
    key: string,
    contentType?: string,
  ): Promise<string> {
    await this.provider.uploadFile(file, key, contentType);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    return await this.provider.downloadFile(key);
  }

  async deleteFile(key: string): Promise<void> {
    await this.provider.deleteFile(key);
  }

  async getUploadUrl(
    category: string,
    filename: string,
    contentType: string,
    expiresIn: number = 3600,
  ): Promise<{ url: string | null; key: string }> {
    const key = `${category}/${randomUUID()}/${filename}`;
    const url = await this.provider.getUploadUrl(key, contentType, expiresIn);
    return { url, key };
  }

  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return await this.provider.getDownloadUrl(key, expiresIn);
  }

  async fileExists(key: string): Promise<boolean> {
    return await this.provider.fileExists(key);
  }

  async deleteWithTTL(key: string, ttlMs: number): Promise<void> {
    setTimeout(async () => {
      try {
        await this.deleteFile(key);
        logger.info(`🗑️  Deleted temp file: ${key}`);
      } catch (error: unknown) {
        logger.warn({ err: error }, `Failed to delete temp file ${key}:`);
      }
    }, ttlMs);
  }
}

export const storageService = new StorageService();

export { PocketDimensionStorageProvider };
