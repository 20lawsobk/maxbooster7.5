/**
 * Storage Service — PDIM-backed Pocket Dimension only.
 *
 * All file I/O is routed through the Pocket Dimension engine which
 * persists chunks via the PDIM HTTP server. No disk, no S3, no
 * Replit Object Storage is used.
 */

import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

export interface StorageProvider {
  uploadFile(file: Buffer, key: string, contentType?: string): Promise<string>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string | null>;
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  fileExists(key: string): Promise<boolean>;
}

/**
 * Pocket Dimension Storage Provider
 *
 * Routes ALL file I/O through the Pocket Dimension engine:
 *   - Level-9 Gzip compression on every chunk
 *   - SHA-256 content-addressed deduplication
 *   - 4 MB chunk size for efficient large-file handling
 *   - Chunks persisted to PDIM HTTP server (zero local disk)
 */
class PocketDimensionStorageProvider implements StorageProvider {
  private pocket: any = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      const { PocketDimensionManager } = await import('../pocket-dimension/index.js');
      const manager = PocketDimensionManager.getInstance('./pocket-dimensions');
      this.pocket = await manager.openPocket('application-storage', {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 32 * 1024 * 1024,
      });
      logger.info('📦 [Storage] Pocket Dimension provider ready (PDIM-backed, level-9 gzip, dedup, 32 MB chunks)');
    } catch (err) {
      logger.error('[Storage] Failed to initialize Pocket Dimension provider:', err);
    }
  }

  private async ensure(): Promise<void> {
    await this.initPromise;
    if (!this.pocket) throw new Error('Pocket Dimension storage provider not initialized');
  }

  async uploadFile(file: Buffer, key: string, contentType?: string): Promise<string> {
    await this.ensure();
    await this.pocket.write(`files/${key}`, file);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    await this.ensure();
    try {
      return await this.pocket.read(`files/${key}`);
    } catch {
      throw new Error(`File not found: ${key}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.ensure();
    try {
      await this.pocket.delete(`files/${key}`);
    } catch { }
  }

  async getUploadUrl(_key: string, _contentType: string, _expiresIn?: number): Promise<string | null> {
    return null;
  }

  async getDownloadUrl(key: string, _expiresIn?: number): Promise<string> {
    return `/api/storage/file/${encodeURIComponent(key)}`;
  }

  async fileExists(key: string): Promise<boolean> {
    await this.ensure();
    try {
      const entry = this.pocket.entries?.get(`files/${key}`);
      return !!entry;
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
    logger.info('📦 [Storage] Using Pocket Dimension (PDIM) as the sole storage backend');
    this.provider = new PocketDimensionStorageProvider();
  }

  async uploadFile(
    file: Buffer,
    category: string,
    filename: string,
    contentType?: string
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
    expiresIn: number = 3600
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
        logger.error(`Failed to delete temp file ${key}:`, error);
      }
    }, ttlMs);
  }
}

export const storageService = new StorageService();

export { PocketDimensionStorageProvider };
