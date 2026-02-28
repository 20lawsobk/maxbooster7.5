/**
 * HYBRID STORAGE SERVICE
 * 
 * Combines Replit Object Storage (hot tier) with Pocket Dimension technology (cold tier)
 * for intelligent, cost-effective storage with automatic tiering.
 * 
 * Tiering Strategy:
 * - Hot Tier (Replit): Recent files, active projects, frequently accessed
 * - Cold Tier (Pocket Dimension): Archives, old versions, rarely accessed (30+ days)
 * 
 * Features:
 * - Intelligent routing based on access patterns
 * - Automatic tiering (30 days idle = cold)
 * - Content-hash deduplication across backends
 * - Cross-user deduplication for public content
 * - Seamless fallback between storage backends
 * - Unified API for all storage operations
 * - Compression for cold storage (Pocket Dimension)
 * - Analytics and optimization recommendations
 */

import { pocketManager, PocketDimension } from '../pocket-dimension/index.js';
import { createHash } from 'crypto';
import { logger } from '../logger.js';
import fs from 'fs/promises';

const COLD_TIER_THRESHOLD_DAYS = 30;
const COLD_TIER_THRESHOLD_MS = COLD_TIER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
const HOT_ACCESS_COUNT_THRESHOLD = 5;
const SIZE_THRESHOLD_FOR_COLD = 50 * 1024 * 1024;

export type StorageTier = 'hot' | 'cold';
export type StorageLocation = 'replit' | 'pocket-dimension';

export interface HybridFileMetadata {
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  compressedSize: number;
  tier: StorageTier;
  location: StorageLocation;
  contentHash: string;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  userId: string;
  isPublic: boolean;
  isDeduplicated: boolean;
  deduplicationRef?: string;
  metadata?: Record<string, any>;
}

export interface DeduplicationStats {
  totalDuplicates: number;
  spaceSaved: number;
  savingsPercent: number;
  crossUserDuplicates: number;
}

export interface TierBreakdown {
  hot: {
    count: number;
    sizeBytes: number;
    files: string[];
  };
  cold: {
    count: number;
    sizeBytes: number;
    compressedSize: number;
    compressionRatio: number;
    files: string[];
  };
}

export interface StorageAnalytics {
  totalFiles: number;
  totalSizeBytes: number;
  physicalSizeBytes: number;
  tierBreakdown: TierBreakdown;
  deduplication: DeduplicationStats;
  overallCompressionRatio: number;
  costSavingsPercent: number;
  recommendations: StorageRecommendation[];
  accessPatterns: {
    mostAccessed: HybridFileMetadata[];
    leastAccessed: HybridFileMetadata[];
    recentlyAccessed: HybridFileMetadata[];
  };
}

export interface StorageRecommendation {
  type: 'tier_down' | 'tier_up' | 'deduplicate' | 'cleanup' | 'compress';
  priority: 'low' | 'medium' | 'high';
  message: string;
  potentialSavings?: number;
  affectedKeys?: string[];
}

export interface UploadResult {
  key: string;
  tier: StorageTier;
  sizeBytes: number;
  compressedSize: number;
  contentHash: string;
  isDeduplicated: boolean;
  compressionRatio?: number;
}

export interface TieringDecision {
  shouldTierDown: boolean;
  shouldTierUp: boolean;
  reason: string;
  currentTier: StorageTier;
  recommendedTier: StorageTier;
}

export class HybridStorageService {
  private static instance: HybridStorageService;
  private replitClient: any = null;
  private coldPocket: PocketDimension | null = null;
  private initialized: boolean = false;
  
  private fileIndex: Map<string, HybridFileMetadata> = new Map();
  private contentHashIndex: Map<string, string[]> = new Map();
  private publicContentHashes: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): HybridStorageService {
    if (!HybridStorageService.instance) {
      HybridStorageService.instance = new HybridStorageService();
    }
    return HybridStorageService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const bucketId = process.env.REPLIT_BUCKET_ID || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || process.env.REPLIT_OBJSTORE_BUCKET_ID || '';
      if (bucketId || process.env.PRIVATE_OBJECT_DIR) {
        try {
          const { Client } = await import('@replit/object-storage');
          const client = new Client();
          // The constructor fires an async init() internally. Catch its promise to
          // prevent an unhandled rejection when the sidecar/bucket isn't available.
          const internalState = (client as any).state;
          if (internalState?.promise && typeof internalState.promise.catch === 'function') {
            internalState.promise.catch((e: Error) => {
              logger.warn('[HybridStorage] Object Storage bucket unavailable, falling back to Pocket Dimension only:', e.message);
              this.replitClient = null;
            });
          }
          this.replitClient = client;
          logger.info(`[HybridStorage] Initialized Replit Object Storage (hot tier)`);
        } catch (e) {
          logger.warn('[HybridStorage] Failed to initialize @replit/object-storage client, falling back to Pocket Dimension only');
          this.replitClient = null;
        }
      } else {
        logger.warn('[HybridStorage] No Replit bucket ID found, all storage will use Pocket Dimension');
      }

      this.coldPocket = await pocketManager.openPocket('hybrid-cold-storage', {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: true,
        chunkSize: 1024 * 1024,
      });

      await this.loadIndex();
      this.initialized = true;

      logger.info('[HybridStorage] Hybrid storage service initialized');
    } catch (error) {
      logger.error('[HybridStorage] Failed to initialize:', error);
      throw error;
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const indexPath = './data/hybrid-storage-index.json';
      const data = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(data);
      
      this.fileIndex = new Map(
        Object.entries(index.files || {}).map(([k, v]: [string, any]) => [
          k,
          { ...v, createdAt: new Date(v.createdAt), lastAccessed: new Date(v.lastAccessed), location: v.location || (v.tier === 'hot' ? 'replit' : 'pocket-dimension') }
        ])
      );
      this.contentHashIndex = new Map(Object.entries(index.contentHashes || {}));
      this.publicContentHashes = new Map(Object.entries(index.publicHashes || {}));
      
      logger.info(`[HybridStorage] Loaded index with ${this.fileIndex.size} entries`);
    } catch {
      this.fileIndex = new Map();
      this.contentHashIndex = new Map();
      this.publicContentHashes = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      await fs.mkdir('./data', { recursive: true });
      await fs.writeFile('./data/hybrid-storage-index.json', JSON.stringify({
        files: Object.fromEntries(this.fileIndex),
        contentHashes: Object.fromEntries(this.contentHashIndex),
        publicHashes: Object.fromEntries(this.publicContentHashes),
        updatedAt: new Date().toISOString(),
      }, null, 2));
    } catch (error) {
      logger.error('[HybridStorage] Failed to save index:', error);
    }
  }

  private computeContentHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private determineTier(entry: HybridFileMetadata): TieringDecision {
    const now = Date.now();
    const timeSinceAccess = now - entry.lastAccessed.getTime();
    const isFrequentlyAccessed = entry.accessCount >= HOT_ACCESS_COUNT_THRESHOLD;

    if (entry.tier === 'hot') {
      if (timeSinceAccess > COLD_TIER_THRESHOLD_MS && !isFrequentlyAccessed) {
        return {
          shouldTierDown: true,
          shouldTierUp: false,
          reason: `File not accessed for ${Math.floor(timeSinceAccess / (24 * 60 * 60 * 1000))} days`,
          currentTier: 'hot',
          recommendedTier: 'cold',
        };
      }
    } else if (entry.tier === 'cold') {
      if (isFrequentlyAccessed && timeSinceAccess < COLD_TIER_THRESHOLD_MS / 2) {
        return {
          shouldTierDown: false,
          shouldTierUp: true,
          reason: `File accessed ${entry.accessCount} times recently`,
          currentTier: 'cold',
          recommendedTier: 'hot',
        };
      }
    }

    return {
      shouldTierDown: false,
      shouldTierUp: false,
      reason: 'File is in appropriate tier',
      currentTier: entry.tier,
      recommendedTier: entry.tier,
    };
  }

  private determineInitialTier(sizeBytes: number, mimeType: string): StorageTier {
    if (sizeBytes > SIZE_THRESHOLD_FOR_COLD) {
      return 'cold';
    }
    return 'hot';
  }

  async upload(
    userId: string,
    fileName: string,
    data: Buffer,
    mimeType: string,
    options?: {
      folder?: string;
      forceTier?: StorageTier;
      forceLocation?: StorageLocation;
      isPublic?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<UploadResult> {
    await this.initialize();

    const contentHash = this.computeContentHash(data);
    const key = this.generateFileKey(userId, fileName, options?.folder);
    const isPublic = options?.isPublic || false;

    const existingKeys = this.contentHashIndex.get(contentHash);
    if (existingKeys && existingKeys.length > 0) {
      const existingEntry = this.fileIndex.get(existingKeys[0]);
      if (existingEntry) {
        const newEntry: HybridFileMetadata = {
          key,
          originalName: fileName,
          mimeType,
          sizeBytes: data.length,
          compressedSize: existingEntry.compressedSize,
          tier: existingEntry.tier,
          location: existingEntry.location,
          contentHash,
          accessCount: 0,
          lastAccessed: new Date(),
          createdAt: new Date(),
          userId,
          isPublic,
          isDeduplicated: true,
          deduplicationRef: existingKeys[0],
          metadata: options?.metadata,
        };

        this.fileIndex.set(key, newEntry);
        existingKeys.push(key);
        
        if (isPublic) {
          this.publicContentHashes.set(contentHash, existingKeys[0]);
        }
        
        await this.saveIndex();

        logger.info(`[HybridStorage] Deduplicated: ${key} -> ${existingKeys[0]}`);
        return {
          key,
          tier: existingEntry.tier,
          sizeBytes: data.length,
          compressedSize: existingEntry.compressedSize,
          contentHash,
          isDeduplicated: true,
          compressionRatio: data.length / existingEntry.compressedSize,
        };
      }
    }

    if (isPublic) {
      const publicRef = this.publicContentHashes.get(contentHash);
      if (publicRef) {
        const existingEntry = this.fileIndex.get(publicRef);
        if (existingEntry) {
          const newEntry: HybridFileMetadata = {
            key,
            originalName: fileName,
            mimeType,
            sizeBytes: data.length,
            compressedSize: existingEntry.compressedSize,
            tier: existingEntry.tier,
            location: existingEntry.location,
            contentHash,
            accessCount: 0,
            lastAccessed: new Date(),
            createdAt: new Date(),
            userId,
            isPublic: true,
            isDeduplicated: true,
            deduplicationRef: publicRef,
            metadata: options?.metadata,
          };

          this.fileIndex.set(key, newEntry);
          
          const hashKeys = this.contentHashIndex.get(contentHash) || [];
          hashKeys.push(key);
          this.contentHashIndex.set(contentHash, hashKeys);
          
          await this.saveIndex();

          logger.info(`[HybridStorage] Cross-user deduplicated: ${key} -> ${publicRef}`);
          return {
            key,
            tier: existingEntry.tier,
            sizeBytes: data.length,
            compressedSize: existingEntry.compressedSize,
            contentHash,
            isDeduplicated: true,
            compressionRatio: data.length / existingEntry.compressedSize,
          };
        }
      }
    }

    const tier = options?.forceTier || this.determineInitialTier(data.length, mimeType);
    let compressedSize = data.length;
    let location: StorageLocation;

    if (options?.forceLocation === 'replit' && !this.replitClient) {
      throw new Error('Replit Object Storage is not available. Cannot force upload to replit location.');
    }

    const useReplit = options?.forceLocation === 'replit' || (options?.forceLocation !== 'pocket-dimension' && tier === 'hot' && this.replitClient);

    if (useReplit && this.replitClient) {
      await this.writeToReplit(key, data, mimeType);
      location = 'replit';
    } else {
      const pocketEntry = await this.coldPocket!.write(`storage/${key}`, data);
      compressedSize = pocketEntry.compressedSize;
      location = 'pocket-dimension';
    }

    const actualTier: StorageTier = location === 'replit' ? 'hot' : 'cold';

    const entry: HybridFileMetadata = {
      key,
      originalName: fileName,
      mimeType,
      sizeBytes: data.length,
      compressedSize,
      tier: actualTier,
      location,
      contentHash,
      accessCount: 0,
      lastAccessed: new Date(),
      createdAt: new Date(),
      userId,
      isPublic,
      isDeduplicated: false,
      metadata: options?.metadata,
    };

    this.fileIndex.set(key, entry);
    
    const hashKeys = this.contentHashIndex.get(contentHash) || [];
    hashKeys.push(key);
    this.contentHashIndex.set(contentHash, hashKeys);

    if (isPublic) {
      this.publicContentHashes.set(contentHash, key);
    }

    await this.saveIndex();

    logger.info(`[HybridStorage] Uploaded: ${key} (${tier} tier, ${data.length} bytes)`);
    return {
      key,
      tier: entry.tier,
      sizeBytes: data.length,
      compressedSize,
      contentHash,
      isDeduplicated: false,
      compressionRatio: data.length / compressedSize,
    };
  }

  private async writeToReplit(key: string, data: Buffer, contentType?: string): Promise<void> {
    if (!this.replitClient) throw new Error('Replit Object Storage client not initialized');
    const result = await this.replitClient.uploadFromBytes(key, data, {
      contentType: contentType || 'application/octet-stream',
    });
    if (!result.ok) {
      throw new Error(`Replit storage write failed for key "${key}": ${result.error}`);
    }
  }

  async read(userId: string, key: string): Promise<Buffer> {
    await this.initialize();

    const entry = this.fileIndex.get(key);
    if (!entry) {
      throw new Error(`File not found: ${key}`);
    }

    if (entry.userId !== userId && !entry.isPublic) {
      throw new Error(`Access denied: ${key}`);
    }

    if (entry.isDeduplicated && entry.deduplicationRef) {
      const refEntry = this.fileIndex.get(entry.deduplicationRef);
      if (refEntry) {
        entry.accessCount++;
        entry.lastAccessed = new Date();
        return this.readFromStorage(refEntry);
      }
    }

    entry.accessCount++;
    entry.lastAccessed = new Date();

    const data = await this.readFromStorage(entry);

    const decision = this.determineTier(entry);
    if (decision.shouldTierUp && this.replitClient) {
      this.scheduleTierUp(key, data).catch(err => 
        logger.error(`[HybridStorage] Failed to tier up ${key}:`, err)
      );
    }

    await this.saveIndex();
    return data;
  }

  private async readFromStorage(entry: HybridFileMetadata): Promise<Buffer> {
    if (entry.location === 'replit' && this.replitClient) {
      return this.readFromReplit(entry.key);
    } else {
      return this.coldPocket!.read(`storage/${entry.key}`);
    }
  }

  private async readFromReplit(key: string): Promise<Buffer> {
    if (!this.replitClient) throw new Error('Replit Object Storage client not initialized');
    const result = await this.replitClient.downloadAsBytes(key);
    if (!result.ok) {
      throw new Error(`Replit storage read failed for key "${key}": ${result.error}`);
    }
    return Buffer.from(result.value);
  }

  async delete(userId: string, key: string): Promise<boolean> {
    await this.initialize();

    const entry = this.fileIndex.get(key);
    if (!entry) return false;

    if (entry.userId !== userId) {
      throw new Error(`Access denied: ${key}`);
    }

    const hashKeys = this.contentHashIndex.get(entry.contentHash);
    if (hashKeys) {
      const idx = hashKeys.indexOf(key);
      if (idx > -1) hashKeys.splice(idx, 1);
      if (hashKeys.length === 0) {
        this.contentHashIndex.delete(entry.contentHash);
        this.publicContentHashes.delete(entry.contentHash);
      }
    }

    if (!entry.isDeduplicated) {
      const otherRefs = hashKeys && hashKeys.length > 0;
      
      if (!otherRefs) {
        if (entry.location === 'replit' && this.replitClient) {
          await this.replitClient.delete(key).catch(() => {});
        } else {
          await this.coldPocket!.delete(`storage/${key}`).catch(() => {});
        }
      } else if (hashKeys && hashKeys.length > 0) {
        const newPrimary = hashKeys[0];
        const newPrimaryEntry = this.fileIndex.get(newPrimary);
        if (newPrimaryEntry) {
          newPrimaryEntry.isDeduplicated = false;
          newPrimaryEntry.deduplicationRef = undefined;
        }
        
        if (entry.isPublic) {
          this.publicContentHashes.set(entry.contentHash, newPrimary);
        }
      }
    }

    this.fileIndex.delete(key);
    await this.saveIndex();

    logger.info(`[HybridStorage] Deleted: ${key}`);
    return true;
  }

  async tierDown(key: string): Promise<boolean> {
    await this.initialize();

    const entry = this.fileIndex.get(key);
    if (!entry || entry.tier === 'cold' || entry.isDeduplicated) return false;

    try {
      const data = await this.readFromReplit(key);
      const pocketEntry = await this.coldPocket!.write(`storage/${key}`, data);

      if (this.replitClient) {
        await this.replitClient.delete(key).catch(() => {});
      }

      entry.tier = 'cold';
      entry.location = 'pocket-dimension';
      entry.compressedSize = pocketEntry.compressedSize;
      await this.saveIndex();

      logger.info(`[HybridStorage] Tiered down: ${key} (saved ${entry.sizeBytes - entry.compressedSize} bytes)`);
      return true;
    } catch (error) {
      logger.error(`[HybridStorage] Failed to tier down ${key}:`, error);
      return false;
    }
  }

  private async scheduleTierUp(key: string, data: Buffer): Promise<void> {
    const entry = this.fileIndex.get(key);
    if (!entry || entry.tier === 'hot' || !this.replitClient) return;

    try {
      await this.writeToReplit(key, data, entry.mimeType);

      await this.coldPocket?.delete(`storage/${key}`).catch(() => {});

      entry.tier = 'hot';
      entry.location = 'replit';
      entry.compressedSize = entry.sizeBytes;
      await this.saveIndex();

      logger.info(`[HybridStorage] Tiered up: ${key}`);
    } catch (error) {
      logger.error(`[HybridStorage] Failed to tier up ${key}:`, error);
    }
  }

  async runAutoTiering(): Promise<{ tieredDown: number; tieredUp: number }> {
    await this.initialize();

    let tieredDown = 0;
    let tieredUp = 0;

    for (const [key, entry] of this.fileIndex) {
      if (entry.isDeduplicated) continue;

      const decision = this.determineTier(entry);

      if (decision.shouldTierDown) {
        if (await this.tierDown(key)) tieredDown++;
      } else if (decision.shouldTierUp && this.replitClient) {
        try {
          const data = await this.readFromStorage(entry);
          await this.scheduleTierUp(key, data);
          tieredUp++;
        } catch {
        }
      }
    }

    logger.info(`[HybridStorage] Auto-tiering: ${tieredDown} down, ${tieredUp} up`);
    return { tieredDown, tieredUp };
  }

  async getAnalytics(userId?: string): Promise<StorageAnalytics> {
    await this.initialize();

    const analytics: StorageAnalytics = {
      totalFiles: 0,
      totalSizeBytes: 0,
      physicalSizeBytes: 0,
      tierBreakdown: {
        hot: { count: 0, sizeBytes: 0, files: [] },
        cold: { count: 0, sizeBytes: 0, compressedSize: 0, compressionRatio: 1, files: [] },
      },
      deduplication: {
        totalDuplicates: 0,
        spaceSaved: 0,
        savingsPercent: 0,
        crossUserDuplicates: 0,
      },
      overallCompressionRatio: 1,
      costSavingsPercent: 0,
      recommendations: [],
      accessPatterns: {
        mostAccessed: [],
        leastAccessed: [],
        recentlyAccessed: [],
      },
    };

    const entries: HybridFileMetadata[] = [];
    let logicalTotal = 0;

    for (const entry of this.fileIndex.values()) {
      if (userId && entry.userId !== userId) continue;

      entries.push(entry);
      analytics.totalFiles++;
      analytics.totalSizeBytes += entry.sizeBytes;
      logicalTotal += entry.sizeBytes;

      if (entry.isDeduplicated) {
        analytics.deduplication.totalDuplicates++;
        analytics.deduplication.spaceSaved += entry.sizeBytes;
        
        if (entry.deduplicationRef) {
          const refEntry = this.fileIndex.get(entry.deduplicationRef);
          if (refEntry && refEntry.userId !== entry.userId) {
            analytics.deduplication.crossUserDuplicates++;
          }
        }
      } else {
        analytics.physicalSizeBytes += entry.compressedSize;

        if (entry.tier === 'hot') {
          analytics.tierBreakdown.hot.count++;
          analytics.tierBreakdown.hot.sizeBytes += entry.sizeBytes;
          analytics.tierBreakdown.hot.files.push(entry.key);
        } else {
          analytics.tierBreakdown.cold.count++;
          analytics.tierBreakdown.cold.sizeBytes += entry.sizeBytes;
          analytics.tierBreakdown.cold.compressedSize += entry.compressedSize;
          analytics.tierBreakdown.cold.files.push(entry.key);
        }
      }
    }

    if (analytics.tierBreakdown.cold.compressedSize > 0) {
      analytics.tierBreakdown.cold.compressionRatio = 
        analytics.tierBreakdown.cold.sizeBytes / analytics.tierBreakdown.cold.compressedSize;
    }

    if (logicalTotal > 0) {
      analytics.deduplication.savingsPercent = 
        (analytics.deduplication.spaceSaved / logicalTotal) * 100;
    }

    if (analytics.physicalSizeBytes > 0) {
      analytics.overallCompressionRatio = analytics.totalSizeBytes / analytics.physicalSizeBytes;
    }

    if (analytics.totalSizeBytes > 0) {
      analytics.costSavingsPercent = 
        ((analytics.totalSizeBytes - analytics.physicalSizeBytes) / analytics.totalSizeBytes) * 100;
    }

    analytics.recommendations = this.generateRecommendations(entries);

    const sorted = [...entries].sort((a, b) => b.accessCount - a.accessCount);
    analytics.accessPatterns.mostAccessed = sorted.slice(0, 10);
    analytics.accessPatterns.leastAccessed = sorted.slice(-10).reverse();
    analytics.accessPatterns.recentlyAccessed = [...entries]
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
      .slice(0, 10);

    return analytics;
  }

  private generateRecommendations(entries: HybridFileMetadata[]): StorageRecommendation[] {
    const recommendations: StorageRecommendation[] = [];
    const tierDownCandidates: string[] = [];
    const tierUpCandidates: string[] = [];

    for (const entry of entries) {
      if (entry.isDeduplicated) continue;

      const decision = this.determineTier(entry);
      if (decision.shouldTierDown) {
        tierDownCandidates.push(entry.key);
      } else if (decision.shouldTierUp) {
        tierUpCandidates.push(entry.key);
      }
    }

    if (tierDownCandidates.length > 0) {
      const potentialSavings = tierDownCandidates.reduce((sum, key) => {
        const entry = this.fileIndex.get(key)!;
        return sum + (entry.sizeBytes * 0.6);
      }, 0);

      recommendations.push({
        type: 'tier_down',
        priority: tierDownCandidates.length > 10 ? 'high' : 'medium',
        message: `${tierDownCandidates.length} files haven't been accessed in ${COLD_TIER_THRESHOLD_DAYS}+ days. Move to cold storage.`,
        potentialSavings: Math.floor(potentialSavings),
        affectedKeys: tierDownCandidates.slice(0, 10),
      });
    }

    if (tierUpCandidates.length > 0) {
      recommendations.push({
        type: 'tier_up',
        priority: 'low',
        message: `${tierUpCandidates.length} cold files are frequently accessed. Consider promoting to hot storage.`,
        affectedKeys: tierUpCandidates.slice(0, 10),
      });
    }

    const neverAccessed = entries.filter(e => e.accessCount === 0);
    if (neverAccessed.length > 10) {
      const totalSize = neverAccessed.reduce((sum, e) => sum + e.sizeBytes, 0);
      recommendations.push({
        type: 'cleanup',
        priority: 'medium',
        message: `${neverAccessed.length} files have never been accessed. Consider cleanup.`,
        potentialSavings: totalSize,
        affectedKeys: neverAccessed.slice(0, 10).map(e => e.key),
      });
    }

    return recommendations;
  }

  listFiles(
    userId: string,
    options?: { tier?: StorageTier; location?: StorageLocation; folder?: string; includePublic?: boolean }
  ): HybridFileMetadata[] {
    const files: HybridFileMetadata[] = [];

    for (const entry of this.fileIndex.values()) {
      if (entry.userId !== userId && !(options?.includePublic && entry.isPublic)) continue;
      if (options?.tier && entry.tier !== options.tier) continue;
      if (options?.location && entry.location !== options.location) continue;
      if (options?.folder && !entry.key.includes(options.folder)) continue;

      files.push(entry);
    }

    return files.sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());
  }

  getMetadata(key: string): HybridFileMetadata | undefined {
    return this.fileIndex.get(key);
  }

  exists(key: string): boolean {
    return this.fileIndex.has(key);
  }

  async getDownloadUrl(userId: string, key: string): Promise<string> {
    const entry = this.fileIndex.get(key);
    if (!entry) throw new Error(`File not found: ${key}`);

    if (entry.userId !== userId && !entry.isPublic) {
      throw new Error(`Access denied: ${key}`);
    }

    return `/api/storage/hybrid/file/${encodeURIComponent(key)}`;
  }

  async getTierBreakdown(userId?: string): Promise<TierBreakdown> {
    await this.initialize();

    const breakdown: TierBreakdown = {
      hot: { count: 0, sizeBytes: 0, files: [] },
      cold: { count: 0, sizeBytes: 0, compressedSize: 0, compressionRatio: 1, files: [] },
    };

    for (const entry of this.fileIndex.values()) {
      if (userId && entry.userId !== userId) continue;
      if (entry.isDeduplicated) continue;

      if (entry.tier === 'hot') {
        breakdown.hot.count++;
        breakdown.hot.sizeBytes += entry.sizeBytes;
        breakdown.hot.files.push(entry.key);
      } else {
        breakdown.cold.count++;
        breakdown.cold.sizeBytes += entry.sizeBytes;
        breakdown.cold.compressedSize += entry.compressedSize;
        breakdown.cold.files.push(entry.key);
      }
    }

    if (breakdown.cold.compressedSize > 0) {
      breakdown.cold.compressionRatio = breakdown.cold.sizeBytes / breakdown.cold.compressedSize;
    }

    return breakdown;
  }

  async getDeduplicationStats(userId?: string): Promise<DeduplicationStats> {
    await this.initialize();

    const stats: DeduplicationStats = {
      totalDuplicates: 0,
      spaceSaved: 0,
      savingsPercent: 0,
      crossUserDuplicates: 0,
    };

    let totalSize = 0;

    for (const entry of this.fileIndex.values()) {
      if (userId && entry.userId !== userId) continue;
      
      totalSize += entry.sizeBytes;

      if (entry.isDeduplicated) {
        stats.totalDuplicates++;
        stats.spaceSaved += entry.sizeBytes;
        
        if (entry.deduplicationRef) {
          const refEntry = this.fileIndex.get(entry.deduplicationRef);
          if (refEntry && refEntry.userId !== entry.userId) {
            stats.crossUserDuplicates++;
          }
        }
      }
    }

    if (totalSize > 0) {
      stats.savingsPercent = (stats.spaceSaved / totalSize) * 100;
    }

    return stats;
  }

  async migrateFile(
    userId: string,
    key: string,
    targetTier: StorageTier,
    targetLocation: StorageLocation
  ): Promise<boolean> {
    await this.initialize();

    const entry = this.fileIndex.get(key);
    if (!entry) return false;
    if (entry.userId !== userId) throw new Error(`Access denied: ${key}`);
    if (entry.isDeduplicated) return false;

    if (entry.location === targetLocation && entry.tier === targetTier) return true;

    if (targetLocation === 'replit' && !this.replitClient) {
      throw new Error('Replit Object Storage is not available. Cannot migrate to replit location.');
    }

    try {
      const data = await this.readFromStorage(entry);

      if (targetLocation === 'replit' && this.replitClient) {
        await this.writeToReplit(key, data, entry.mimeType);
        if (entry.location === 'pocket-dimension') {
          await this.coldPocket?.delete(`storage/${key}`).catch(() => {});
        }
        entry.location = 'replit';
        entry.tier = 'hot';
        entry.compressedSize = entry.sizeBytes;
      } else {
        const pocketEntry = await this.coldPocket!.write(`storage/${key}`, data);
        if (entry.location === 'replit' && this.replitClient) {
          await this.replitClient.delete(key).catch(() => {});
        }
        entry.location = 'pocket-dimension';
        entry.tier = targetTier;
        entry.compressedSize = pocketEntry.compressedSize;
      }

      await this.saveIndex();
      logger.info(`[HybridStorage] Migrated ${key} to ${targetLocation}/${targetTier}`);
      return true;
    } catch (error) {
      logger.error(`[HybridStorage] Failed to migrate ${key}:`, error);
      return false;
    }
  }

  async optimizeStorage(userId: string): Promise<{ tieredDown: number; tieredUp: number; deduplicated: number }> {
    await this.initialize();

    const result = await this.runAutoTiering();
    let deduplicated = 0;

    const userFiles = this.listFiles(userId);
    const hashGroups = new Map<string, HybridFileMetadata[]>();

    for (const file of userFiles) {
      if (file.isDeduplicated) continue;
      const group = hashGroups.get(file.contentHash) || [];
      group.push(file);
      hashGroups.set(file.contentHash, group);
    }

    for (const [, group] of hashGroups) {
      if (group.length <= 1) continue;
      const primary = group[0];
      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        dup.isDeduplicated = true;
        dup.deduplicationRef = primary.key;
        deduplicated++;
      }
    }

    if (deduplicated > 0) {
      await this.saveIndex();
    }

    return { ...result, deduplicated };
  }

  async cleanup(
    userId: string,
    options?: { olderThanDays?: number }
  ): Promise<{ deletedCount: number; freedBytes: number }> {
    await this.initialize();

    const thresholdDays = options?.olderThanDays || 90;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let deletedCount = 0;
    let freedBytes = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.fileIndex) {
      if (entry.userId !== userId) continue;
      const timeSinceAccess = now - new Date(entry.lastAccessed).getTime();
      if (timeSinceAccess > thresholdMs && entry.accessCount === 0) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      const entry = this.fileIndex.get(key);
      if (!entry) continue;
      try {
        await this.delete(userId, key);
        deletedCount++;
        freedBytes += entry.sizeBytes;
      } catch {
      }
    }

    return { deletedCount, freedBytes };
  }

  private generateFileKey(userId: string, fileName: string, folder?: string): string {
    const timestamp = Date.now();
    const hash = createHash('sha256')
      .update(`${userId}:${fileName}:${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const base = folder 
      ? `${userId}/${folder}/${hash}-${sanitizedName}` 
      : `${userId}/${hash}-${sanitizedName}`;
    
    return base;
  }
}

export const hybridStorageService = HybridStorageService.getInstance();
