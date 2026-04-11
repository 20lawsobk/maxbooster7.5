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
  /** Per-user write locks — serialises concurrent read-modify-write operations per user. */
  private writeLocks: Map<string, Promise<void>> = new Map();

  private constructor() {}

  /**
   * Acquire a per-user write lock. Returns a release function.
   * All callers for the same userId are serialised via promise chaining.
   */
  private acquireWriteLock(userId: string): Promise<() => void> {
    let release!: () => void;
    const pending: Promise<void> = (this.writeLocks.get(userId) ?? Promise.resolve()).then(
      () => new Promise<void>(res => { release = res; })
    );
    this.writeLocks.set(userId, pending.then(() => {}, () => {}));
    return pending.then(() => release);
  }
  
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
      
      const defaultFolders = ['audio', 'artwork', 'documents', 'beats', 'stems', 'exports', 'ai-journey'];
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
      logger.warn({ err: error }, `[PocketDimension] Failed to create storage for user ${userId}:`);
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
      .where(eq(userStorage.userId, userId))
      .limit(1);
    
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
      logger.warn({ err: error }, `[PocketDimension] Failed to open storage for user ${userId}:`);
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
      .where(eq(userStorage.userId, userId))
      .limit(1);
    
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
      .where(eq(userStorage.userId, userId))
      .limit(1);
    
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

  // ─────────────────────────────────────────────────────────────────────────
  // AI JOURNEY METHODS
  // All per-user AI knowledge lives in the ai-journey/ folder of each pocket.
  // Base model knowledge lives on the D: drive Model Knowledge Server.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record one AI generation event in the user's journey.
   * Appended to ai-journey/generation-history.json (capped at 1000 entries).
   */
  async recordGeneration(userId: string, meta: {
    prompt:      string;
    type:        'video' | 'audio' | 'image' | 'beat';
    durationSec?: number;
    genre?:       string;
    mood?:        string;
    rating?:      number;
    createdAt?:   string;
  }): Promise<void> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return;

    // Serialise concurrent writes to prevent the read-modify-write race condition
    // where two concurrent calls each read the same history and overwrite each other.
    const release = await this.acquireWriteLock(userId);
    try {
      const KEY = 'ai-journey/generation-history.json';
      let history: any[] = [];
      try {
        const raw = await pocket.read(KEY);
        history = JSON.parse(raw.toString());
      } catch {}

      history.push({ ...meta, createdAt: meta.createdAt ?? new Date().toISOString() });
      if (history.length > 1000) history = history.slice(-1000);

      await pocket.write(KEY, JSON.stringify(history));
    } finally {
      release();
    }
    logger.debug(`[AIJourney] Recorded ${meta.type} generation for user ${userId}`);
  }

  /**
   * Get or update a user's AI preference profile.
   * Stored in ai-journey/profile.json — accumulates taste signals over time.
   */
  async getAiProfile(userId: string): Promise<Record<string, any>> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return {};
    try {
      const raw = await pocket.read('ai-journey/profile.json');
      return JSON.parse(raw.toString());
    } catch {
      return {};
    }
  }

  async updateAiProfile(userId: string, updates: Record<string, any>): Promise<void> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return;
    // Serialise concurrent updates to prevent last-write-wins overwrite.
    const release = await this.acquireWriteLock(userId);
    try {
      const current = await this.getAiProfile(userId);
      const merged  = { ...current, ...updates, updatedAt: new Date().toISOString() };
      await pocket.write('ai-journey/profile.json', JSON.stringify(merged));
    } finally {
      release();
    }
  }

  /**
   * Get a user's recent generation history.
   */
  async getGenerationHistory(userId: string, limit = 50): Promise<any[]> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return [];
    try {
      const raw     = await pocket.read('ai-journey/generation-history.json');
      const history = JSON.parse(raw.toString()) as any[];
      return history.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Save a fine-tune delta for this user (personalisation weights offset).
   * Stored as binary in ai-journey/fine-tune-delta.bin — applied on top of
   * the base model weights that live on the D: drive Model Knowledge Server.
   */
  async saveFinetuneDelata(userId: string, deltaBytes: Buffer): Promise<void> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return;
    await pocket.write('ai-journey/fine-tune-delta.bin', deltaBytes);
    logger.info(`[AIJourney] Saved fine-tune delta (${deltaBytes.length} bytes) for user ${userId}`);
  }

  async getFinetuneDelata(userId: string): Promise<Buffer | null> {
    const pocket = await this.getUserPocket(userId);
    if (!pocket) return null;
    try {
      return await pocket.read('ai-journey/fine-tune-delta.bin');
    } catch {
      return null;
    }
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
