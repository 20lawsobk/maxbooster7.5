/**
 * Storage Service — PDIM-backed Pocket Dimension with filesystem write-through.
 *
 * All file I/O is routed through the Pocket Dimension engine which
 * persists chunks via the PDIM HTTP server. A local filesystem write-through
 * cache in uploads/files/ ensures files survive PDIM eviction.
 */

import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import fsPromises from "fs/promises";
import path from "path";

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

const LOCAL_STORAGE_DIR = path.resolve("./uploads/files");

function localFilePath(key: string): string {
  return path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, path.sep));
}

async function ensureLocalDir(filePath: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Pocket Dimension Storage Provider
 *
 * Routes ALL file I/O through the Pocket Dimension engine:
 *   - Level-9 Gzip compression on every chunk
 *   - SHA-256 content-addressed deduplication
 *   - 4 MB chunk size for efficient large-file handling
 *   - Chunks persisted to PDIM HTTP server (zero local disk)
 * Additionally writes a copy to the local filesystem for durability.
 */
class PocketDimensionStorageProvider implements StorageProvider {
  private pocket: Record<string, unknown> | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      const { PocketDimensionManager } =
        await import("../pocket-dimension/index.js");
      const manager = PocketDimensionManager.getInstance("./pocket-dimensions");
      this.pocket = await manager.openPocket("application-storage", {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 32 * 1024 * 1024,
      });
      logger.info(
        "📦 [Storage] Pocket Dimension provider ready (PDIM-backed, level-9 gzip, dedup, 32 MB chunks)",
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
    // Write to local filesystem first (durable)
    try {
      const localPath = localFilePath(key);
      await ensureLocalDir(localPath);
      await fsPromises.writeFile(localPath, file);
    } catch (fsErr) {
      logger.warn(
        `[Storage] Local filesystem write failed for key=${key}:`,
        fsErr,
      );
    }

    // Also write to PDIM (with timeout so a congested queue never blocks the response)
    try {
      await this.ensure();
      await Promise.race([
        (
          this.pocket as Record<string, (...a: unknown[]) => Promise<unknown>>
        ).write(`files/${key}`, file),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("PDIM write timeout")), 6000),
        ),
      ]);
    } catch (pdimErr) {
      logger.warn(
        `[Storage] PDIM write failed for key=${key}, file is on disk only:`,
        pdimErr,
      );
    }

    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    // Try PDIM first
    try {
      await this.ensure();
      return await this.pocket.read(`files/${key}`);
    } catch {
      // Fall through to local filesystem
    }

    // Fall back to local filesystem
    const localPath = localFilePath(key);
    try {
      return await fsPromises.readFile(localPath);
    } catch {
      // file not on disk either
    }

    throw new Error(`File not found: ${key}`);
  }

  async deleteFile(key: string): Promise<void> {
    // Delete from local filesystem
    try {
      await fsPromises.unlink(localFilePath(key));
    } catch (fsErr: Record<string, unknown>) {
      if (fsErr.code !== "ENOENT") {
        logger.warn(
          `[StorageService] local deleteFile failed for key=${key}:`,
          fsErr,
        );
      }
    }

    // Delete from PDIM
    try {
      await this.ensure();
      await this.pocket.delete(`files/${key}`);
    } catch (err) {
      logger.warn(
        `[StorageService] deleteFile failed for key=${key}: ${err?.message}`,
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
    // Check local filesystem first (fast)
    const localPath = localFilePath(key);
    if (fs.existsSync(localPath)) return true;

    // Check PDIM
    try {
      await this.ensure();
      return this.pocket.exists(`files/${key}`);
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
