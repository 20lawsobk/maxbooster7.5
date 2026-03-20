/**
 * HYBRID STORAGE SERVICE — TRUE HYBRID MODE
 *
 * File I/O is automatically tiered between two storage backends:
 *
 *   HOT tier  → Replit App Storage (Object Storage)
 *                Files ≤ 50 MB, recently or frequently accessed.
 *                Direct serving from Replit's CDN edge — zero latency.
 *                Configured via REPLIT_BUCKET_ID / DEFAULT_OBJECT_STORAGE_BUCKET_ID.
 *
 *   COLD tier → Pocket Dimension (PDIM-backed)
 *                Files > 50 MB, infrequently accessed, or when Replit
 *                Object Storage is unavailable.  Provides level-9 gzip
 *                compression, SHA-256 content-addressed deduplication,
 *                versioning, and zero local disk usage via PDIM HTTP.
 *
 * Auto-tiering runs every 6 hours:
 *   - Tier-down: hot files not accessed in 30+ days → cold
 *   - Tier-up:   cold files accessed 5+ times recently → hot
 *
 * BoosterState sidecar acts as an L1 metadata cache — index lookups
 * are served from in-memory Rust KV without hitting PDIM.
 *
 * Graceful degradation: if Replit Object Storage is unavailable at
 * startup, the service falls back to PDIM-only mode automatically.
 */

import { pocketManager, PocketDimension } from '../pocket-dimension/index.js';
import { createHash } from 'crypto';
import { logger } from '../logger.js';
import { getPdimClient } from '../lib/pdimClient.js';
import { Client as ReplitObjectStorageClient } from '@replit/object-storage';
import { getBoosterStateClient } from '../lib/boosterStateClient.js';

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
      // ── Hot tier: Replit App Storage (Object Storage) ─────────────────────
      // Enabled when REPLIT_BUCKET_ID or DEFAULT_OBJECT_STORAGE_BUCKET_ID is
      // set (both are auto-injected by Replit when Object Storage is enabled).
      const bucketId = process.env.REPLIT_BUCKET_ID || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (bucketId) {
        try {
          // Pass bucketId directly — the Replit sidecar returns empty string in this env
          this.replitClient = new ReplitObjectStorageClient({ bucketId });
          logger.info('[HybridStorage] Replit App Storage initialized — hot tier active (bucket configured)');
        } catch (e: any) {
          logger.warn(`[HybridStorage] Replit App Storage unavailable: ${e.message} — falling back to PDIM-only`);
          this.replitClient = null;
        }
      } else {
        logger.warn('[HybridStorage] REPLIT_BUCKET_ID not set — hot tier disabled, using PDIM-only mode');
        this.replitClient = null;
      }

      // ── Cold tier: Pocket Dimension (PDIM-backed, 32 MB chunks) ──────────
      try {
        this.coldPocket = await pocketManager.openPocket('hybrid-cold-storage', {
          compressionLevel: 9,
          enableDeduplication: true,
          enableVersioning: true,
          chunkSize: 32 * 1024 * 1024,
        });
        logger.info('[HybridStorage] Pocket Dimension storage initialized (32 MB chunks, level-9 gzip, dedup)');
      } catch (e: any) {
        logger.warn(`[HybridStorage] Pocket Dimension unavailable: ${e.message}`);
        this.coldPocket = null;
      }

      if (!this.replitClient && !this.coldPocket) {
        throw new Error('No storage backends available — both Replit Object Storage and Pocket Dimension failed to initialize');
      }

      await this.loadIndex();
      this.initialized = true;

      const hotStatus = this.replitClient ? 'Replit App Storage (hot)' : 'disabled';
      const coldStatus = this.coldPocket ? 'Pocket Dimension / PDIM (cold)' : 'disabled';
      logger.info(`[HybridStorage] Storage service initialized — hot: ${hotStatus}, cold: ${coldStatus}`);
    } catch (error) {
      logger.error('[HybridStorage] Failed to initialize:', error);
      throw error;
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      // L1: Try BoosterState in-memory cache first (fastest path — in-process Rust KV)
      let raw: string | null = null;
      try {
        const bs = await getBoosterStateClient();
        if (bs) raw = await bs.get('hybrid:storage:index');
      } catch { /* BoosterState unavailable — fall through to PDIM */ }

      // L2: Fall back to PDIM if BoosterState cache miss
      if (!raw) raw = await getPdimClient().get('hybrid:storage:index');
      if (!raw) throw new Error('No index in any storage backend');

      const index = JSON.parse(raw);
      
      this.fileIndex = new Map(
        Object.entries(index.files || {}).map(([k, v]: [string, any]) => [
          k,
          {
            ...v,
            createdAt: new Date(v.createdAt),
            lastAccessed: new Date(v.lastAccessed),
            // Preserve the actual location value (may be 'replit' for hot-tier files)
            location: (v.location as StorageLocation) || 'pocket-dimension',
          }
        ])
      );
      this.contentHashIndex = new Map(Object.entries(index.contentHashes || {}));
      this.publicContentHashes = new Map(Object.entries(index.publicHashes || {}));
      
      logger.info(`[HybridStorage] Loaded index with ${this.fileIndex.size} entries (hot+cold)`);
    } catch {
      this.fileIndex = new Map();
      this.contentHashIndex = new Map();
      this.publicContentHashes = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    const payload = JSON.stringify({
      files: Object.fromEntries(this.fileIndex),
      contentHashes: Object.fromEntries(this.contentHashIndex),
      publicHashes: Object.fromEntries(this.publicContentHashes),
      updatedAt: new Date().toISOString(),
    });
    // Write to both PDIM (durable) and BoosterState (fast L1 cache) in parallel
    await Promise.allSettled([
      getPdimClient().set('hybrid:storage:index', payload).catch((e: any) =>
        logger.error('[HybridStorage] Failed to persist index to PDIM:', e)
      ),
      getBoosterStateClient().then(bs => bs?.set('hybrid:storage:index', payload)).catch(() => {
        /* BoosterState unavailable — PDIM is source of truth */
      }),
    ]);
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

  private determineInitialTier(sizeBytes: number, _mimeType: string): StorageTier {
    // Hot tier (Replit App Storage): files ≤ 50 MB when hot tier is available.
    // These are served at low latency from Replit's edge without decompression.
    // Cold tier (Pocket Dimension): large files or when hot tier is unavailable.
    if (this.replitClient && sizeBytes <= SIZE_THRESHOLD_FOR_COLD) {
      return 'hot';
    }
    return 'cold';
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
    let actualTier: StorageTier = tier;

    if (tier === 'hot' && this.replitClient) {
      // ── Hot write: Replit App Storage (CDN-backed, instant serving) ──────
      await this.writeToReplit(`storage/${key}`, data, mimeType);
      location = 'replit';
      compressedSize = data.length; // Object Storage does not compress
    } else if (this.coldPocket) {
      // ── Cold write: Pocket Dimension (PDIM-backed, compressed) ───────────
      const pocketEntry = await this.coldPocket.write(`storage/${key}`, data);
      compressedSize = pocketEntry.compressedSize;
      location = 'pocket-dimension';
      actualTier = 'cold';
    } else if (this.replitClient) {
      // coldPocket unavailable — fall back to hot tier even for large files
      await this.writeToReplit(`storage/${key}`, data, mimeType);
      location = 'replit';
      actualTier = 'hot';
    } else {
      throw new Error('[HybridStorage] All storage backends unavailable — cannot write file');
    }

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

    // Trigger async tier-up if the file is frequently accessed and is in cold storage.
    // This runs in the background so the read returns immediately.
    if (this.replitClient && entry.location === 'pocket-dimension') {
      const decision = this.determineTier(entry);
      if (decision.shouldTierUp) {
        this.scheduleTierUp(key, data).catch((e: any) =>
          logger.warn(`[HybridStorage] Background tier-up failed for ${key}: ${e.message}`)
        );
      }
    }

    await this.saveIndex();
    return data;
  }

  private async readFromStorage(entry: HybridFileMetadata): Promise<Buffer> {
    // Route based on where the file actually lives.
    if (entry.location === 'replit' && this.replitClient) {
      try {
        return await this.readFromReplit(`storage/${entry.key}`);
      } catch (e: any) {
        // If hot tier read fails, try cold tier as fallback (file may have been
        // migrated or the Replit Object Storage may be temporarily unavailable).
        logger.warn(`[HybridStorage] Hot tier read failed for ${entry.key} (${e.message}) — trying cold tier`);
        if (this.coldPocket) {
          return this.coldPocket.read(`storage/${entry.key}`);
        }
        throw e;
      }
    }
    // Cold tier (pocket-dimension) — includes legacy 'replit' entries when
    // replitClient is unavailable (graceful degradation).
    if (!this.coldPocket) {
      throw new Error(`[HybridStorage] Cold tier unavailable and cannot read ${entry.key} from hot tier`);
    }
    return this.coldPocket.read(`storage/${entry.key}`);
  }

  private async readFromReplit(key: string): Promise<Buffer> {
    if (!this.replitClient) throw new Error('Replit Object Storage client not initialized');
    const result = await this.replitClient.downloadAsBytes(key);
    if (!result.ok) {
      throw new Error(`Replit storage read failed for key "${key}": ${result.error}`);
    }
    // downloadAsBytes returns [Buffer, Metadata] via GCS — take the first element
    const buf = Array.isArray(result.value) ? result.value[0] : result.value;
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as any);
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
        // No other references — physically delete from whichever backend holds the file.
        if (entry.location === 'replit' && this.replitClient) {
          await (this.replitClient as any).delete(`storage/${key}`).catch(() => {});
        } else if (this.coldPocket) {
          await this.coldPocket.delete(`storage/${key}`).catch(() => {});
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
      if (entry.location === 'replit' && this.replitClient && this.coldPocket) {
        // Move from Replit App Storage (hot) → Pocket Dimension (cold)
        const data = await this.readFromReplit(`storage/${key}`);
        const pocketEntry = await this.coldPocket.write(`storage/${key}`, data);

        // Delete from Replit Object Storage after successful cold write
        try {
          await (this.replitClient as any).delete(`storage/${key}`);
        } catch (e: any) {
          logger.warn(`[HybridStorage] Failed to delete ${key} from Replit App Storage after tier-down: ${e.message}`);
        }

        entry.tier = 'cold';
        entry.location = 'pocket-dimension';
        entry.compressedSize = pocketEntry.compressedSize;
      } else if (entry.location === 'pocket-dimension') {
        // File already in cold tier — just normalize the index entry
        entry.tier = 'cold';
      }

      await this.saveIndex();
      logger.info(`[HybridStorage] Tier-down: ${key} → cold/pocket-dimension`);
      return true;
    } catch (error) {
      logger.error(`[HybridStorage] Failed to tier down ${key}:`, error);
      return false;
    }
  }

  private async scheduleTierUp(key: string, data: Buffer): Promise<void> {
    if (!this.replitClient) return; // Hot tier not available

    const entry = this.fileIndex.get(key);
    if (!entry || entry.location === 'replit' || entry.isDeduplicated) return;
    if (data.length > SIZE_THRESHOLD_FOR_COLD) return; // Too large for hot tier

    try {
      // Move from Pocket Dimension (cold) → Replit App Storage (hot)
      await this.writeToReplit(`storage/${key}`, data, entry.mimeType);

      // Remove from cold pocket after successful hot write
      if (this.coldPocket) {
        await this.coldPocket.delete(`storage/${key}`).catch(() => {
          /* cold deletion is best-effort — the hot copy is the canonical version now */
        });
      }

      entry.tier = 'hot';
      entry.location = 'replit';
      entry.compressedSize = data.length; // No compression in hot tier

      await this.saveIndex();
      logger.info(`[HybridStorage] Tier-up: ${key} → hot/replit (${data.length} bytes)`);
    } catch (error) {
      logger.warn(`[HybridStorage] Failed to tier up ${key}: ${(error as Error).message}`);
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
      } else if (decision.shouldTierUp && entry.location === 'pocket-dimension' && this.replitClient && this.coldPocket) {
        try {
          const data = await this.coldPocket.read(`storage/${key}`);
          await this.scheduleTierUp(key, data);
          tieredUp++;
        } catch (e: any) {
          logger.warn(`[HybridStorage] Auto tier-up failed for ${key}: ${e.message}`);
        }
      }
    }

    logger.info(`[HybridStorage] Auto-tiering complete: ${tieredDown} tiered down, ${tieredUp} tiered up`);
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

    try {
      const data = await this.readFromStorage(entry);

      if (targetLocation === 'replit' && targetTier === 'hot' && this.replitClient) {
        // Migrate to Replit App Storage (hot tier)
        await this.writeToReplit(`storage/${key}`, data, entry.mimeType);
        if (entry.location === 'pocket-dimension' && this.coldPocket) {
          await this.coldPocket.delete(`storage/${key}`).catch(() => {});
        }
        entry.location = 'replit';
        entry.tier = 'hot';
        entry.compressedSize = data.length;
        logger.info(`[HybridStorage] Migrated ${key} → replit/hot`);
      } else if (this.coldPocket) {
        // Migrate to Pocket Dimension (cold tier)
        const pocketEntry = await this.coldPocket.write(`storage/${key}`, data);
        if (entry.location === 'replit' && this.replitClient) {
          await (this.replitClient as any).delete(`storage/${key}`).catch(() => {});
        }
        entry.location = 'pocket-dimension';
        entry.tier = 'cold';
        entry.compressedSize = pocketEntry.compressedSize;
        logger.info(`[HybridStorage] Migrated ${key} → pocket-dimension/cold`);
      } else {
        throw new Error('Target storage backend unavailable');
      }

      await this.saveIndex();
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
