/**
 * Storage Service - Abstraction layer for file storage
 *
 * Supports local filesystem (development), S3, and Replit App Storage (production).
 * Switch between them using STORAGE_PROVIDER environment variable.
 *
 * This enables the platform to scale without code changes:
 * - Development: Uses local filesystem
 * - Production: Uses S3 or Replit App Storage
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/defaults.js';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

export interface StorageProvider {
  /**
   * Upload a file to storage
   * @returns The key/path where the file was stored
   */
  uploadFile(file: Buffer, key: string, contentType?: string): Promise<string>;

  /**
   * Download a file from storage
   * @returns The file contents as a Buffer
   */
  downloadFile(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Get a presigned URL for direct upload (S3 only)
   * For local storage, returns null
   */
  getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string | null>;

  /**
   * Get a presigned URL for download
   * For local storage, returns a local file path
   */
  getDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Check if a file exists
   */
  fileExists(key: string): Promise<boolean>;
}

/**
 * Local Filesystem Storage Provider
 * Used in development, stores files in ./uploads directory
 */
class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string = './uploads') {
    this.baseDir = baseDir;
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private getFullPath(key: string): string {
    return path.join(this.baseDir, key);
  }

  async uploadFile(file: Buffer, key: string, contentType?: string): Promise<string> {
    const fullPath = this.getFullPath(key);
    await this.ensureDir(fullPath);
    await fs.writeFile(fullPath, file);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key);
    return await fs.readFile(fullPath);
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.unlink(fullPath);
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') throw error;
    }
  }

  async getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string | null> {
    // Local storage doesn't support presigned URLs
    return null;
  }

  async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const encodedKey = encodeURIComponent(key);
    return `/api/storage/file/${encodedKey}`;
  }

  async fileExists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * S3 Storage Provider
 * Used in production, stores files in S3-compatible object storage
 */
class S3StorageProvider implements StorageProvider {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    if (!config.storage.bucket) {
      throw new Error('S3_BUCKET is required when using S3 storage provider');
    }

    this.bucket = config.storage.bucket;

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: config.storage.region,
      endpoint: config.storage.endpoint, // For MinIO/custom S3
      credentials:
        config.storage.accessKeyId && config.storage.secretAccessKey
          ? {
              accessKeyId: config.storage.accessKeyId,
              secretAccessKey: config.storage.secretAccessKey,
            }
          : undefined, // Use IAM role if no credentials provided
    });
  }

  async uploadFile(file: Buffer, key: string, contentType?: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async getUploadUrl(key: string, contentType: string, expiresIn: number = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Replit App Storage Provider
 * Uses GCS-backed Replit Object Storage with presigned URLs
 */
class ReplitStorageProvider implements StorageProvider {
  private bucketName: string = '';
  private objectPrefix: string = '';
  private storageClient: any = null;
  private initPromise: Promise<void>;

  constructor() {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!privateDir) {
      throw new Error('PRIVATE_OBJECT_DIR is required for Replit storage provider');
    }
    const parts = privateDir.replace(/^\//, '').split('/');
    this.bucketName = parts[0];
    this.objectPrefix = parts.slice(1).join('/');

    this.initPromise = this.initClient();
  }

  private async initClient(): Promise<void> {
    const { Storage } = await import('@google-cloud/storage');
    this.storageClient = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: "http://127.0.0.1:1106/token",
        type: "external_account",
        credential_source: {
          url: "http://127.0.0.1:1106/credential",
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }

  private async ensureClient(): Promise<void> {
    await this.initPromise;
    if (!this.storageClient) {
      throw new Error('GCS client not initialized');
    }
  }

  private getObjectPath(key: string): string {
    return this.objectPrefix ? `${this.objectPrefix}/${key}` : key;
  }

  async uploadFile(file: Buffer, key: string, contentType?: string): Promise<string> {
    await this.ensureClient();
    const objectPath = this.getObjectPath(key);
    const bucket = this.storageClient.bucket(this.bucketName);
    const gcsFile = bucket.file(objectPath);

    await gcsFile.save(file, {
      contentType: contentType || 'application/octet-stream',
      resumable: false,
    });

    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    await this.ensureClient();
    const objectPath = this.getObjectPath(key);
    const bucket = this.storageClient.bucket(this.bucketName);
    const gcsFile = bucket.file(objectPath);

    const [contents] = await gcsFile.download();
    return Buffer.from(contents);
  }

  async deleteFile(key: string): Promise<void> {
    await this.ensureClient();
    const objectPath = this.getObjectPath(key);
    const bucket = this.storageClient.bucket(this.bucketName);
    const gcsFile = bucket.file(objectPath);

    await gcsFile.delete({ ignoreNotFound: true });
  }

  async getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string | null> {
    return null;
  }

  async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const encodedKey = encodeURIComponent(key);
    return `/api/storage/file/${encodedKey}`;
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.ensureClient();
      const objectPath = this.getObjectPath(key);
      const bucket = this.storageClient.bucket(this.bucketName);
      const gcsFile = bucket.file(objectPath);
      const [exists] = await gcsFile.exists();
      return exists;
    } catch {
      return false;
    }
  }
}

/**
 * Hybrid Storage Provider
 * 
 * Combines Replit Object Storage (hot tier) with Pocket Dimension (cold tier).
 * Uses HybridStorageService for intelligent tiering, deduplication, and compression.
 * Falls back to direct Replit storage for legacy keys not in the hybrid index.
 */
class HybridStorageProvider implements StorageProvider {
  private hybridService: any = null;
  private replitFallback: ReplitStorageProvider | null = null;
  private initPromise: Promise<void>;
  private systemUserId = '__system__';

  constructor() {
    try {
      this.replitFallback = new ReplitStorageProvider();
    } catch {
      this.replitFallback = null;
    }
    this.initPromise = this.initHybrid();
  }

  private async initHybrid(): Promise<void> {
    try {
      const { hybridStorageService } = await import('./hybridStorageService.js');
      await hybridStorageService.initialize();
      this.hybridService = hybridStorageService;
      logger.info('📦 Hybrid Storage Provider initialized (Replit hot + Pocket Dimension cold)');
    } catch (error) {
      logger.warn('📦 Hybrid Storage fallback: Pocket Dimension unavailable, using Replit only', error);
    }
  }

  private async ensureHybrid(): Promise<void> {
    await this.initPromise;
  }

  async uploadFile(file: Buffer, key: string, contentType?: string): Promise<string> {
    await this.ensureHybrid();

    if (this.replitFallback) {
      await this.replitFallback.uploadFile(file, key, contentType);
    } else {
      throw new Error('No storage backend available');
    }

    return key;
  }

  async downloadFile(key: string): Promise<Buffer> {
    await this.ensureHybrid();

    if (this.hybridService) {
      const meta = this.hybridService.getMetadata(key);
      if (meta) {
        try {
          return await this.hybridService.read(meta.userId, key);
        } catch {
        }
      }
    }

    if (this.replitFallback) {
      return await this.replitFallback.downloadFile(key);
    }
    throw new Error(`File not found: ${key}`);
  }

  async deleteFile(key: string): Promise<void> {
    await this.ensureHybrid();

    if (this.hybridService) {
      const meta = this.hybridService.getMetadata(key);
      if (meta) {
        try {
          await this.hybridService.delete(meta.userId, key);
          return;
        } catch {
        }
      }
    }

    if (this.replitFallback) {
      await this.replitFallback.deleteFile(key);
    }
  }

  async getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string | null> {
    return null;
  }

  async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const encodedKey = encodeURIComponent(key);
    return `/api/storage/file/${encodedKey}`;
  }

  async fileExists(key: string): Promise<boolean> {
    await this.ensureHybrid();
    if (this.hybridService) {
      if (this.hybridService.exists(key)) return true;
    }
    if (this.replitFallback) {
      return await this.replitFallback.fileExists(key);
    }
    return false;
  }
}

/**
 * Storage Service Singleton
 * Automatically uses the correct provider based on configuration
 */
class StorageService {
  private provider: StorageProvider;

  constructor() {
    if (config.storage.provider === 's3') {
      logger.info('📦 Using S3 storage provider');
      this.provider = new S3StorageProvider();
    } else if (config.storage.provider === 'replit') {
      logger.info('📦 Using Hybrid Storage provider (Replit hot + Pocket Dimension cold)');
      this.provider = new HybridStorageProvider();
    } else {
      logger.info('📦 Using local storage provider');
      this.provider = new LocalStorageProvider();
    }
  }

  /**
   * Upload a file to storage
   * @param file File contents as Buffer
   * @param category Category for organizing files (e.g., 'audio', 'temp', 'exports')
   * @param filename Original filename
   * @param contentType MIME type
   * @returns Storage key where file was saved
   */
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

  /**
   * Download a file from storage
   */
  async downloadFile(key: string): Promise<Buffer> {
    return await this.provider.downloadFile(key);
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(key: string): Promise<void> {
    await this.provider.deleteFile(key);
  }

  /**
   * Get a presigned URL for client-side upload (S3 only)
   * Returns null for local storage
   *
   * Usage:
   * 1. Client requests upload URL
   * 2. Client uploads directly to S3 using presigned URL
   * 3. Client notifies server when upload is complete
   */
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

  /**
   * Get a download URL for a file
   * - S3: Returns presigned URL
   * - Local: Returns file path
   */
  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return await this.provider.getDownloadUrl(key, expiresIn);
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<boolean> {
    return await this.provider.fileExists(key);
  }

  /**
   * Delete files with a TTL (Time To Live)
   * Useful for temporary files
   */
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

// Export singleton instance
export const storageService = new StorageService();

// Export for testing/mocking
export { LocalStorageProvider, S3StorageProvider, ReplitStorageProvider };
