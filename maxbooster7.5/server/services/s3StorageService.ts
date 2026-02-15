import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { Readable } from 'stream';

/**
 * S3 Storage Service for production file storage
 * Handles audio files, cover art, and other assets
 */
export class S3StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;
  private cloudFrontUrl?: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.bucketName = process.env.AWS_S3_BUCKET || 'maxbooster-assets';
    this.cloudFrontUrl = process.env.CLOUDFRONT_URL;

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // Use IAM role if no credentials provided
    });

    logger.info(`S3 Storage initialized for bucket: ${this.bucketName}`);
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folder: string = 'uploads'
  ): Promise<{ url: string; key: string; cdnUrl?: string }> {
    try {
      // Generate unique key with folder structure
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
      const key = `${folder}/${timestamp}-${hash}-${fileName}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'uploaded-at': new Date().toISOString(),
          'original-name': fileName,
        },
      });

      await this.s3Client.send(command);

      // Generate URLs
      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      const cdnUrl = this.cloudFrontUrl ? `${this.cloudFrontUrl}/${key}` : undefined;

      logger.info(`File uploaded to S3: ${key}`);

      return {
        url: cdnUrl || s3Url,
        key,
        cdnUrl,
      };
    } catch (error: unknown) {
      logger.error('S3 upload failed:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  /**
   * Upload audio file for distribution
   */
  async uploadAudioFile(
    buffer: Buffer,
    fileName: string,
    userId: string,
    metadata?: Record<string, string>
  ): Promise<{ url: string; key: string; duration?: number }> {
    try {
      const folder = `audio/${userId}`;
      const result = await this.uploadFile(buffer, fileName, 'audio/mpeg', folder);

      // Store additional metadata if needed
      if (metadata) {
        await this.updateMetadata(result.key, metadata);
      }

      return result;
    } catch (error: unknown) {
      logger.error('Audio upload failed:', error);
      throw error;
    }
  }

  /**
   * Upload cover art with automatic thumbnail generation
   */
  async uploadCoverArt(
    buffer: Buffer,
    fileName: string,
    userId: string
  ): Promise<{ url: string; key: string; thumbnailUrl?: string }> {
    try {
      const folder = `covers/${userId}`;

      // Upload original
      const result = await this.uploadFile(buffer, fileName, 'image/jpeg', folder);

      // Generate and upload thumbnail version using Sharp
      try {
        const sharp = (await import('sharp')).default;
        const thumbnailBuffer = await sharp(buffer)
          .resize(300, 300, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 80 })
          .toBuffer();

        const thumbFileName = `thumb_${fileName}`;
        const thumbResult = await this.uploadFile(
          thumbnailBuffer,
          thumbFileName,
          'image/jpeg',
          `${folder}/thumbnails`
        );

        return {
          ...result,
          thumbnailUrl: thumbResult.url,
        };
      } catch (thumbError: unknown) {
        logger.warn('Thumbnail generation failed, returning original only:', thumbError);
        return result;
      }
    } catch (error: unknown) {
      logger.error('Cover art upload failed:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for direct upload
   */
  async getPresignedUploadUrl(
    fileName: string,
    mimeType: string,
    userId: string,
    expiresIn: number = 3600
  ): Promise<{ uploadUrl: string; key: string }> {
    try {
      const timestamp = Date.now();
      const key = `uploads/${userId}/${timestamp}-${fileName}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

      return { uploadUrl, key };
    } catch (error: unknown) {
      logger.error('Failed to generate presigned URL:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for download
   */
  async getPresignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error: unknown) {
      logger.error('Failed to generate download URL:', error);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      logger.info(`File deleted from S3: ${key}`);
    } catch (error: unknown) {
      logger.error('S3 delete failed:', error);
      throw error;
    }
  }

  /**
   * Update file metadata
   */
  private async updateMetadata(key: string, metadata: Record<string, string>): Promise<void> {
    // S3 doesn't support updating metadata directly
    // Would need to copy object with new metadata
    // For now, store metadata in database
    logger.info(`Metadata update requested for ${key}:`, metadata);
  }

  /**
   * Stream file from S3
   */
  async streamFile(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return response.Body as Readable;
    } catch (error: unknown) {
      logger.error('S3 stream failed:', error);
      throw error;
    }
  }

  /**
   * Check if we have S3 configured
   */
  isConfigured(): boolean {
    return !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET
    );
  }

  /**
   * Get storage info
   */
  getStorageInfo(): {
    provider: string;
    bucket: string;
    region: string;
    cdnEnabled: boolean;
  } {
    return {
      provider: 'aws-s3',
      bucket: this.bucketName,
      region: this.region,
      cdnEnabled: !!this.cloudFrontUrl,
    };
  }
}

// Export singleton instance
export const s3Storage = new S3StorageService();
