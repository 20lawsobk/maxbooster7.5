/**
 * HYBRID STORAGE SERVICE
 * 
 * Combines Replit's Object Storage (cloud-native GCS) with 
 * Pocket Dimension (infinite-capacity virtualized storage)
 * 
 * Architecture:
 * - Replit Object Storage: Fast cloud storage for public assets, uploads, and CDN-ready files
 * - Pocket Dimension: Compressed, encrypted personal storage for user-specific files
 * 
 * The hybrid approach provides:
 * - Fast CDN-backed delivery for public assets via Replit Object Storage
 * - Infinite-like compressed storage via Pocket Dimension
 * - Automatic tier selection based on file type and access patterns
 * - Seamless file migration between tiers
 */

import { ObjectStorageService, objectStorageClient } from '../replit_integrations/object_storage/index.js';
import { userPocketService } from './userPocketDimensionService.js';
import { logger } from '../logger.js';
import { createHash } from 'crypto';
import type { File } from '@google-cloud/storage';

export enum StorageTier {
  CLOUD = 'cloud',      // Replit Object Storage (GCS)
  POCKET = 'pocket',    // Pocket Dimension compressed storage
  HYBRID = 'hybrid',    // Metadata in cloud, content in pocket
}

export interface StorageLocation {
  tier: StorageTier;
  cloudPath?: string;   // Path in Replit Object Storage
  pocketPath?: string;  // Path in Pocket Dimension
  contentHash?: string; // For deduplication
}

export interface HybridStorageConfig {
  defaultTier: StorageTier;
  autoTierThresholdBytes: number; // Files larger than this go to pocket
  compressionMinBytes: number;    // Minimum size for compression benefits
  deduplicationEnabled: boolean;
}

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  compressedSize?: number;
  contentType: string;
  location: StorageLocation;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

const DEFAULT_CONFIG: HybridStorageConfig = {
  defaultTier: StorageTier.CLOUD,
  autoTierThresholdBytes: 50 * 1024 * 1024, // 50MB
  compressionMinBytes: 1024, // 1KB
  deduplicationEnabled: true,
};

// The user's custom bucket ID for primary cloud storage
const PRIMARY_BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || 'replit-objstore-97079a38-bcc2-4973-b983-6be5afb7f969';

export class HybridStorageService {
  private static instance: HybridStorageService;
  private objectStorage: ObjectStorageService;
  private config: HybridStorageConfig;
  private contentHashIndex: Map<string, StorageLocation> = new Map();

  private constructor(config?: Partial<HybridStorageConfig>) {
    this.objectStorage = new ObjectStorageService();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<HybridStorageConfig>): HybridStorageService {
    if (!HybridStorageService.instance) {
      HybridStorageService.instance = new HybridStorageService(config);
    }
    return HybridStorageService.instance;
  }

  /**
   * Store a file using the optimal tier based on characteristics
   */
  async storeFile(
    userId: string,
    fileName: string,
    content: Buffer,
    options: {
      contentType?: string;
      tier?: StorageTier;
      isPublic?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<StoredFile> {
    const { contentType = 'application/octet-stream', tier, isPublic = false, metadata = {} } = options;
    
    // Determine optimal tier
    const selectedTier = tier || this.selectOptimalTier(content, contentType, isPublic);
    
    // Generate content hash for deduplication
    const contentHash = this.config.deduplicationEnabled 
      ? createHash('sha256').update(content).digest('hex')
      : undefined;
    
    // Check for existing content (deduplication)
    if (contentHash && this.contentHashIndex.has(contentHash)) {
      const existingLocation = this.contentHashIndex.get(contentHash)!;
      logger.info(`[HybridStorage] Deduplication hit for ${fileName}, reusing existing content`);
      
      return {
        id: `dedupe-${contentHash.slice(0, 16)}`,
        name: fileName,
        size: content.length,
        contentType,
        location: existingLocation,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { ...metadata, deduplicated: true },
      };
    }

    let location: StorageLocation;

    switch (selectedTier) {
      case StorageTier.CLOUD:
        location = await this.storeInCloud(userId, fileName, content, contentType, isPublic);
        break;
      
      case StorageTier.POCKET:
        location = await this.storeInPocket(userId, fileName, content, contentType);
        break;
      
      case StorageTier.HYBRID:
        location = await this.storeHybrid(userId, fileName, content, contentType, isPublic);
        break;
      
      default:
        throw new Error(`Unknown storage tier: ${selectedTier}`);
    }

    location.contentHash = contentHash;
    
    // Index for deduplication
    if (contentHash) {
      this.contentHashIndex.set(contentHash, location);
    }

    logger.info(`[HybridStorage] Stored ${fileName} in ${selectedTier} tier (${content.length} bytes)`);

    return {
      id: `${selectedTier}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: fileName,
      size: content.length,
      compressedSize: location.tier === StorageTier.POCKET ? undefined : content.length,
      contentType,
      location,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata,
    };
  }

  /**
   * Retrieve a file from any tier
   */
  async retrieveFile(userId: string, location: StorageLocation): Promise<Buffer | null> {
    try {
      switch (location.tier) {
        case StorageTier.CLOUD:
          if (!location.cloudPath) return null;
          return await this.retrieveFromCloud(location.cloudPath);
        
        case StorageTier.POCKET:
          if (!location.pocketPath) return null;
          return await this.retrieveFromPocket(userId, location.pocketPath);
        
        case StorageTier.HYBRID:
          // Hybrid stores content in pocket, metadata in cloud
          if (!location.pocketPath) return null;
          return await this.retrieveFromPocket(userId, location.pocketPath);
        
        default:
          return null;
      }
    } catch (error) {
      logger.error(`[HybridStorage] Error retrieving file:`, error);
      return null;
    }
  }

  /**
   * Migrate a file between tiers
   */
  async migrateFile(
    userId: string,
    currentLocation: StorageLocation,
    targetTier: StorageTier
  ): Promise<StorageLocation | null> {
    const content = await this.retrieveFile(userId, currentLocation);
    if (!content) return null;

    // Store in new tier
    const newLocation = await this.storeInTier(userId, 'migrated-file', content, 'application/octet-stream', targetTier);
    
    // Delete from old tier (optional, could be scheduled)
    await this.deleteFromLocation(userId, currentLocation);
    
    return newLocation;
  }

  /**
   * Get storage statistics for a user
   */
  async getUserStorageStats(userId: string): Promise<{
    cloudBytes: number;
    pocketBytes: number;
    pocketCompressedBytes: number;
    totalFiles: number;
    deduplicationSavings: number;
  }> {
    const pocket = await userPocketService.getUserPocket(userId);
    const pocketStats = pocket ? await pocket.getStats() : null;

    return {
      cloudBytes: 0, // Would need to query GCS
      pocketBytes: pocketStats?.totalSize || 0,
      pocketCompressedBytes: pocketStats?.compressedSize || 0,
      totalFiles: pocketStats?.totalEntries || 0,
      deduplicationSavings: pocketStats?.deduplicationSavings || 0,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private selectOptimalTier(content: Buffer, contentType: string, isPublic: boolean): StorageTier {
    // Public files always go to cloud for CDN benefits
    if (isPublic) {
      return StorageTier.CLOUD;
    }

    // Large files benefit from pocket compression
    if (content.length > this.config.autoTierThresholdBytes) {
      return StorageTier.POCKET;
    }

    // Media files that need streaming go to cloud
    if (contentType.startsWith('audio/') || contentType.startsWith('video/')) {
      return StorageTier.CLOUD;
    }

    // Text/document files benefit from compression
    if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
      return content.length > this.config.compressionMinBytes 
        ? StorageTier.POCKET 
        : StorageTier.CLOUD;
    }

    return this.config.defaultTier;
  }

  private async storeInCloud(
    userId: string,
    fileName: string,
    content: Buffer,
    contentType: string,
    isPublic: boolean
  ): Promise<StorageLocation> {
    const bucketId = PRIMARY_BUCKET_ID;
    const objectPath = `users/${userId}/files/${Date.now()}-${fileName}`;
    
    try {
      const bucket = objectStorageClient.bucket(bucketId);
      const file = bucket.file(objectPath);
      
      await file.save(content, {
        contentType,
        metadata: {
          userId,
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
        },
      });

      return {
        tier: StorageTier.CLOUD,
        cloudPath: `/${bucketId}/${objectPath}`,
      };
    } catch (error) {
      logger.error(`[HybridStorage] Cloud storage error:`, error);
      // Fallback to pocket if cloud fails
      return this.storeInPocket(userId, fileName, content, contentType);
    }
  }

  private async storeInPocket(
    userId: string,
    fileName: string,
    content: Buffer,
    contentType: string
  ): Promise<StorageLocation> {
    const pocket = await userPocketService.getUserPocket(userId);
    if (!pocket) {
      throw new Error(`No pocket dimension available for user ${userId}`);
    }

    const pocketPath = `files/${Date.now()}-${fileName}`;
    await pocket.write(pocketPath, content);

    return {
      tier: StorageTier.POCKET,
      pocketPath,
    };
  }

  private async storeHybrid(
    userId: string,
    fileName: string,
    content: Buffer,
    contentType: string,
    isPublic: boolean
  ): Promise<StorageLocation> {
    // Store content in pocket (compressed)
    const pocketLocation = await this.storeInPocket(userId, fileName, content, contentType);
    
    // Store metadata pointer in cloud for discoverability
    const metadataPath = `users/${userId}/meta/${Date.now()}-${fileName}.json`;
    const metadata = {
      originalName: fileName,
      contentType,
      size: content.length,
      pocketPath: pocketLocation.pocketPath,
      createdAt: new Date().toISOString(),
    };
    
    try {
      const bucket = objectStorageClient.bucket(PRIMARY_BUCKET_ID);
      const file = bucket.file(metadataPath);
      await file.save(JSON.stringify(metadata), { contentType: 'application/json' });
    } catch (error) {
      logger.warn(`[HybridStorage] Failed to store cloud metadata, pocket-only storage:`, error);
    }

    return {
      tier: StorageTier.HYBRID,
      cloudPath: `/${PRIMARY_BUCKET_ID}/${metadataPath}`,
      pocketPath: pocketLocation.pocketPath,
    };
  }

  private async storeInTier(
    userId: string,
    fileName: string,
    content: Buffer,
    contentType: string,
    tier: StorageTier
  ): Promise<StorageLocation> {
    switch (tier) {
      case StorageTier.CLOUD:
        return this.storeInCloud(userId, fileName, content, contentType, false);
      case StorageTier.POCKET:
        return this.storeInPocket(userId, fileName, content, contentType);
      case StorageTier.HYBRID:
        return this.storeHybrid(userId, fileName, content, contentType, false);
    }
  }

  private async retrieveFromCloud(cloudPath: string): Promise<Buffer> {
    const [bucketName, ...objectParts] = cloudPath.slice(1).split('/');
    const objectName = objectParts.join('/');
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [content] = await file.download();
    return content;
  }

  private async retrieveFromPocket(userId: string, pocketPath: string): Promise<Buffer | null> {
    const pocket = await userPocketService.getUserPocket(userId);
    if (!pocket) return null;

    const content = await pocket.read(pocketPath);
    return content ? Buffer.from(content) : null;
  }

  private async deleteFromLocation(userId: string, location: StorageLocation): Promise<void> {
    try {
      if (location.cloudPath) {
        const [bucketName, ...objectParts] = location.cloudPath.slice(1).split('/');
        const objectName = objectParts.join('/');
        const bucket = objectStorageClient.bucket(bucketName);
        await bucket.file(objectName).delete();
      }

      if (location.pocketPath) {
        const pocket = await userPocketService.getUserPocket(userId);
        if (pocket) {
          await pocket.delete(location.pocketPath);
        }
      }
    } catch (error) {
      logger.warn(`[HybridStorage] Error deleting from location:`, error);
    }
  }
}

// Export singleton instance
export const hybridStorage = HybridStorageService.getInstance();
