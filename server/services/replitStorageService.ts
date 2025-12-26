import { Client } from '@replit/object-storage';
import { logger } from '../logger.js';
import crypto from 'crypto';

/**
 * Replit App Storage Service for production file storage
 * Handles audio files, cover art, and other assets using Replit's built-in cloud storage
 */
export class ReplitStorageService {
  private client: Client;
  private bucketId: string;

  constructor() {
    this.bucketId = process.env.REPLIT_BUCKET_ID || '';

    if (!this.bucketId) {
      throw new Error('REPLIT_BUCKET_ID environment variable is required');
    }

    // Initialize Replit Storage client (auto-authenticates)
    this.client = new Client();

    logger.info(`✅ Replit App Storage initialized for bucket: ${this.bucketId}`);
  }

  /**
   * Upload a file to Replit App Storage
   */
  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string = 'uploads'
  ): Promise<{ url: string; key: string }> {
    try {
      // Generate unique key with folder structure
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
      const key = `${folder}/${timestamp}-${hash}-${fileName}`;

      // Upload to Replit App Storage
      const result = await this.client.uploadFromBytes(key, buffer, {
        contentType: mimeType,
      });

      if (!result.ok) {
        throw new Error(`Upload failed: ${result.error}`);
      }

      logger.info(`✅ File uploaded to Replit App Storage: ${key}`);

      // Generate public URL (Replit storage URLs)
      const url = `https://storage.replit.com/${this.bucketId}/${key}`;

      return {
        url,
        key,
      };
    } catch (error: unknown) {
      logger.error('❌ Failed to upload file to Replit App Storage:', error);
      throw new Error(
        `Storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Download a file from Replit App Storage
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      const result = await this.client.downloadAsBytes(key);

      if (!result.ok) {
        throw new Error(`Download failed: ${result.error}`);
      }

      logger.info(`✅ File downloaded from Replit App Storage: ${key}`);
      // Ensure we return a proper Node.js Buffer (Replit returns Uint8Array)
      return Buffer.from(result.value);
    } catch (error: unknown) {
      logger.error('❌ Failed to download file from Replit App Storage:', error);
      throw new Error(
        `Storage download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete a file from Replit App Storage
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const result = await this.client.delete(key);

      if (!result.ok) {
        throw new Error(`Delete failed: ${result.error}`);
      }

      logger.info(`✅ File deleted from Replit App Storage: ${key}`);
    } catch (error: unknown) {
      logger.error('❌ Failed to delete file from Replit App Storage:', error);
      throw new Error(
        `Storage delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a file exists in Replit App Storage
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);

      if (!result.ok) {
        return false;
      }

      return result.value;
    } catch (error: unknown) {
      logger.error('❌ Failed to check file existence in Replit App Storage:', error);
      return false;
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(prefix: string = ''): Promise<string[]> {
    try {
      const result = await this.client.list({
        prefix,
      });

      if (!result.ok) {
        throw new Error(`List failed: ${result.error}`);
      }

      return result.value.map((obj) => obj.name);
    } catch (error: unknown) {
      logger.error('❌ Failed to list files in Replit App Storage:', error);
      throw new Error(
        `Storage list failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the public URL for a file
   */
  getPublicUrl(key: string): string {
    return `https://storage.replit.com/${this.bucketId}/${key}`;
  }
}

// Singleton instance
let storageInstance: ReplitStorageService | null = null;

/**
 * TODO: Add function documentation
 */
export function getReplitStorageService(): ReplitStorageService {
  if (!storageInstance) {
    storageInstance = new ReplitStorageService();
  }
  return storageInstance;
}
