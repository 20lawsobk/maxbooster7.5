/**
 * USER POCKET DIMENSION SERVICE
 * 
 * Automatically creates and manages a personal Pocket Dimension storage space
 * for each user account. Each user gets their own infinite-capacity storage
 * with encryption, compression, and nested dimension support.
 */

import { pocketManager, PocketDimension } from '../pocket-dimension/index.js';
import { db } from '../db.js';
import { userStorage, userStorageFiles, type UserStorage } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';
import { createHash, randomBytes } from 'crypto';

const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5GB default quota

export class UserPocketDimensionService {
  private static instance: UserPocketDimensionService;
  private activePockets: Map<string, PocketDimension> = new Map();
  
  private constructor() {}
  
  static getInstance(): UserPocketDimensionService {
    if (!UserPocketDimensionService.instance) {
      UserPocketDimensionService.instance = new UserPocketDimensionService();
    }
    return UserPocketDimensionService.instance;
  }

  /**
   * Initialize a pocket dimension for a new user account
   * Called automatically when a user account is created
   */
  async initializeUserStorage(userId: string, email: string): Promise<UserStorage> {
    const storagePrefix = this.generateStoragePrefix(userId);
    const encryptionKey = this.generateEncryptionKey(userId, email);
    
    try {
      const pocket = await pocketManager.openPocket(`user-${userId}`, {
        encryptionKey,
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: true,
        chunkSize: 1024 * 1024, // 1MB chunks
      });
      
      await pocket.write('.pocket-init', JSON.stringify({
        createdAt: new Date().toISOString(),
        userId,
        version: '1.0.0',
      }));
      
      const defaultFolders = ['audio', 'artwork', 'documents', 'beats', 'stems', 'exports'];
      for (const folder of defaultFolders) {
        await pocket.write(`${folder}/.gitkeep`, '');
      }
      
      const [storage] = await db
        .insert(userStorage)
        .values({
          userId,
          storagePrefix,
          totalBytes: 0,
          fileCount: 0,
          quotaBytes: DEFAULT_QUOTA_BYTES,
          isActive: true,
          lastAccessedAt: new Date(),
        })
        .returning();
      
      this.activePockets.set(userId, pocket);
      
      logger.info(`[PocketDimension] Created storage space for user ${userId}`);
      
      return storage;
    } catch (error) {
      logger.error(`[PocketDimension] Failed to create storage for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get or open a user's pocket dimension
   */
  async getUserPocket(userId: string): Promise<PocketDimension | null> {
    if (this.activePockets.has(userId)) {
      return this.activePockets.get(userId)!;
    }
    
    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));
    
    if (!storage || !storage.isActive) {
      return null;
    }
    
    try {
      const pocket = await pocketManager.openPocket(`user-${userId}`);
      this.activePockets.set(userId, pocket);
      
      await db
        .update(userStorage)
        .set({ lastAccessedAt: new Date() })
        .where(eq(userStorage.userId, userId));
      
      return pocket;
    } catch (error) {
      logger.error(`[PocketDimension] Failed to open storage for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Store a file in user's pocket dimension
   */
  async storeFile(
    userId: string,
    fileName: string,
    data: Buffer,
    options?: {
      folder?: string;
      mimeType?: string;
      isPublic?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<{ fileKey: string; sizeBytes: number; compressedSize: number }> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) {
      throw new Error(`Storage not initialized for user ${userId}`);
    }
    
    const folder = options?.folder || 'uploads';
    const fileKey = `${folder}/${Date.now()}-${fileName}`;
    
    const entry = await pocket.write(fileKey, data);
    
    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));
    
    if (storage) {
      await db.insert(userStorageFiles).values({
        userId,
        storageId: storage.id,
        fileName,
        fileKey,
        mimeType: options?.mimeType,
        sizeBytes: data.length,
        folder,
        isPublic: options?.isPublic || false,
        metadata: options?.metadata || {},
      });
      
      await db
        .update(userStorage)
        .set({
          totalBytes: (storage.totalBytes || 0) + data.length,
          fileCount: (storage.fileCount || 0) + 1,
          lastAccessedAt: new Date(),
        })
        .where(eq(userStorage.id, storage.id));
    }
    
    logger.info(`[PocketDimension] Stored file ${fileKey} for user ${userId}`);
    
    return {
      fileKey,
      sizeBytes: entry.size,
      compressedSize: entry.compressedSize,
    };
  }

  /**
   * Read a file from user's pocket dimension
   */
  async readFile(userId: string, fileKey: string): Promise<Buffer> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) {
      throw new Error(`Storage not initialized for user ${userId}`);
    }
    
    return await pocket.read(fileKey);
  }

  /**
   * Delete a file from user's pocket dimension
   */
  async deleteFile(userId: string, fileKey: string): Promise<boolean> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) {
      return false;
    }
    
    const deleted = await pocket.delete(fileKey);
    
    if (deleted) {
      await db
        .delete(userStorageFiles)
        .where(eq(userStorageFiles.fileKey, fileKey));
    }
    
    return deleted;
  }

  /**
   * List files in user's pocket dimension
   */
  async listFiles(userId: string, folder?: string): Promise<{
    path: string;
    size: number;
    compressedSize: number;
    type: string;
    createdAt: Date;
  }[]> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) {
      return [];
    }
    
    const entries = await pocket.list(folder);
    return entries.map(entry => ({
      path: entry.path,
      size: entry.size,
      compressedSize: entry.compressedSize,
      type: entry.type,
      createdAt: entry.createdAt,
    }));
  }

  /**
   * Get storage stats for a user
   */
  async getStorageStats(userId: string): Promise<{
    totalBytes: number;
    compressedBytes: number;
    fileCount: number;
    quotaBytes: number;
    usagePercent: number;
    compressionRatio: number;
  }> {
    const pocket = await this.getUserPocket(userId);
    const [storage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, userId));
    
    if (!pocket || !storage) {
      return {
        totalBytes: 0,
        compressedBytes: 0,
        fileCount: 0,
        quotaBytes: DEFAULT_QUOTA_BYTES,
        usagePercent: 0,
        compressionRatio: 1,
      };
    }
    
    const stats = pocket.getStats();
    
    return {
      totalBytes: stats.totalSize,
      compressedBytes: stats.compressedSize,
      fileCount: stats.totalEntries,
      quotaBytes: storage.quotaBytes || DEFAULT_QUOTA_BYTES,
      usagePercent: ((storage.totalBytes || 0) / (storage.quotaBytes || DEFAULT_QUOTA_BYTES)) * 100,
      compressionRatio: stats.compressionRatio,
    };
  }

  /**
   * Create a nested dimension within user's storage (folder with special powers)
   */
  async createNestedDimension(userId: string, dimensionName: string): Promise<PocketDimension> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) {
      throw new Error(`Storage not initialized for user ${userId}`);
    }
    
    return await pocket.createNestedDimension(dimensionName);
  }

  /**
   * Close a user's pocket dimension (free memory)
   */
  async closeUserPocket(userId: string): Promise<void> {
    const pocket = this.activePockets.get(userId);
    if (pocket) {
      await pocketManager.closePocket(`user-${userId}`);
      this.activePockets.delete(userId);
    }
  }

  private generateStoragePrefix(userId: string): string {
    const hash = createHash('sha256').update(userId).digest('hex').substring(0, 12);
    return `pd-${hash}`;
  }

  private generateEncryptionKey(userId: string, _email: string): string {
    const uniqueSalt = randomBytes(32).toString('hex');
    const masterSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
    return createHash('sha512')
      .update(`${masterSecret}:${uniqueSalt}:${userId}:${Date.now()}`)
      .digest('hex')
      .substring(0, 64);
  }
}

export const userPocketService = UserPocketDimensionService.getInstance();
