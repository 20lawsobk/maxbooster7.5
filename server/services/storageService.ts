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
import { Client } from '@replit/object-storage';
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
    // Return local file path
    return this.getFullPath(key);
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
 * Used in production when deployed on Replit, stores files in Replit cloud storage
 */
class ReplitStorageProvider implements StorageProvider {
  private client: Client;
  private bucketId: string;

  constructor() {
    if (!config.storage.replitBucketId) {
      throw new Error('REPLIT_BUCKET_ID is required when using replit storage provider');
    }

    this.bucketId = config.storage.replitBucketId;
    this.client = new Client();
  }

  async uploadFile(file: Buffer, key: string, contentType?: string): Promise<string> {
    // Write buffer to temp file first (workaround for Replit SDK bug with uploadFromBytes)
    const tempPath = `/tmp/upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const fs = await import('fs/promises');
    await fs.writeFile(tempPath, file);
    
    try {
      const result = await this.client.uploadFromFilename(key, tempPath, {
        contentType: contentType,
      });

      if (!result.ok) {
        throw new Error(`Replit storage upload failed: ${result.error}`);
      }

      return key;
    } finally {
      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    // Use downloadToFilename instead of downloadAsBytes (workaround for Replit SDK bug)
    const tempPath = `/tmp/download-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const fs = await import('fs/promises');
    
    try {
      const result = await this.client.downloadToFilename(key, tempPath);

      if (!result.ok) {
        throw new Error(`Replit storage download failed: ${result.error}`);
      }

      // Read the file into a buffer
      return await fs.readFile(tempPath);
    } finally {
      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  async deleteFile(key: string): Promise<void> {
    const result = await this.client.delete(key);

    if (!result.ok) {
      throw new Error(`Replit storage delete failed: ${result.error}`);
    }
  }

  async getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string | null> {
    // Replit storage doesn't support presigned URLs
    return null;
  }

  async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    // Return public URL for Replit storage
    return `https://storage.replit.com/${this.bucketId}/${key}`;
  }

  async fileExists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);

    if (!result.ok) {
      return false;
    }

    return result.value;
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
      logger.info('📦 Using Replit App Storage provider');
      this.provider = new ReplitStorageProvider();
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
