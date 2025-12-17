/**
 * POCKET DIMENSION STORAGE ADAPTER FOR SIMULATION
 * 
 * Uses the Pocket Dimension technology to store simulation data with:
 * - 9:1+ compression ratios for user data
 * - Content-addressed deduplication (similar users share storage)
 * - Aggregate tracking (count millions without storing millions of objects)
 * - Lazy loading (only load data when needed)
 * 
 * This allows simulating 50+ years with millions of users without memory issues.
 */

import { pocketManager, PocketDimension } from '../pocket-dimension/index.js';
import { logger } from '../logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AggregateUserData {
  total: number;
  byTier: {
    free: number;
    basic: number;
    pro: number;
    enterprise: number;
  };
  byArchetype: {
    hobbyist: number;
    emerging_artist: number;
    established_artist: number;
    label: number;
    enterprise: number;
  };
  avgRevenue: number;
  avgStreams: number;
  avgFollowers: number;
  totalRevenue: number;
  totalStreams: number;
}

export interface SimulationSnapshot {
  day: number;
  timestamp: Date;
  users: AggregateUserData;
  revenue: {
    daily: number;
    monthly: number;
    yearly: number;
    lifetime: number;
  };
  metrics: Record<string, number>;
}

// ============================================================================
// POCKET SIMULATION STORAGE
// ============================================================================

export class PocketSimulationStorage {
  private pocket: PocketDimension | null = null;
  private simulationId: string;
  private isInitialized: boolean = false;
  
  // In-memory aggregates (tiny footprint for millions of users)
  private aggregateUsers: AggregateUserData = {
    total: 0,
    byTier: { free: 0, basic: 0, pro: 0, enterprise: 0 },
    byArchetype: { hobbyist: 0, emerging_artist: 0, established_artist: 0, label: 0, enterprise: 0 },
    avgRevenue: 0,
    avgStreams: 0,
    avgFollowers: 0,
    totalRevenue: 0,
    totalStreams: 0,
  };
  
  // Sample pool for behavioral simulation (max 1000 users in memory)
  private samplePool: Map<string, any> = new Map();
  private readonly MAX_SAMPLE_SIZE = 1000;
  
  // Snapshots stored in pocket dimension
  private snapshotCount: number = 0;

  constructor(simulationId: string) {
    this.simulationId = simulationId;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.pocket = await pocketManager.openPocket(`sim-${this.simulationId}`, {
        compressionLevel: 9,
        enableDeduplication: true,
        chunkSize: 256 * 1024, // 256KB chunks for simulation data
      });
      
      this.isInitialized = true;
      logger.info(`[PocketStorage] Initialized for simulation ${this.simulationId}`);
    } catch (error) {
      logger.warn(`[PocketStorage] Failed to initialize pocket, using memory-only mode`);
      this.isInitialized = true;
    }
  }

  // ============================================================================
  // AGGREGATE OPERATIONS (Zero memory growth for user scaling)
  // ============================================================================

  addUsers(count: number, distribution: {
    tier: 'standard' | 'pro' | 'enterprise' | 'lifetime';
    archetype: 'hobbyist' | 'emerging_artist' | 'established_artist' | 'label' | 'enterprise';
    revenue: number;
    streams: number;
    followers: number;
  }[]): void {
    for (const user of distribution) {
      this.aggregateUsers.total++;
      this.aggregateUsers.byTier[user.tier]++;
      this.aggregateUsers.byArchetype[user.archetype]++;
      this.aggregateUsers.totalRevenue += user.revenue;
      this.aggregateUsers.totalStreams += user.streams;
    }
    
    // Update averages
    if (this.aggregateUsers.total > 0) {
      this.aggregateUsers.avgRevenue = this.aggregateUsers.totalRevenue / this.aggregateUsers.total;
      this.aggregateUsers.avgStreams = this.aggregateUsers.totalStreams / this.aggregateUsers.total;
    }
  }

  addUsersAggregate(count: number, tierDistribution: Record<string, number>, archetypeDistribution: Record<string, number>, avgRevenue: number): void {
    this.aggregateUsers.total += count;
    
    for (const [tier, pct] of Object.entries(tierDistribution)) {
      const tierCount = Math.floor(count * pct);
      this.aggregateUsers.byTier[tier as keyof typeof this.aggregateUsers.byTier] += tierCount;
    }
    
    for (const [archetype, pct] of Object.entries(archetypeDistribution)) {
      const archetypeCount = Math.floor(count * pct);
      this.aggregateUsers.byArchetype[archetype as keyof typeof this.aggregateUsers.byArchetype] += archetypeCount;
    }
    
    this.aggregateUsers.totalRevenue += count * avgRevenue;
    this.aggregateUsers.avgRevenue = this.aggregateUsers.totalRevenue / Math.max(1, this.aggregateUsers.total);
  }

  removeUsers(count: number): void {
    // Distribute churn across tiers proportionally
    const totalBefore = this.aggregateUsers.total;
    if (totalBefore === 0) return;
    
    for (const tier of Object.keys(this.aggregateUsers.byTier) as Array<keyof typeof this.aggregateUsers.byTier>) {
      const tierPct = this.aggregateUsers.byTier[tier] / totalBefore;
      const tierChurn = Math.floor(count * tierPct);
      this.aggregateUsers.byTier[tier] = Math.max(0, this.aggregateUsers.byTier[tier] - tierChurn);
    }
    
    for (const archetype of Object.keys(this.aggregateUsers.byArchetype) as Array<keyof typeof this.aggregateUsers.byArchetype>) {
      const archetypePct = this.aggregateUsers.byArchetype[archetype] / totalBefore;
      const archetypeChurn = Math.floor(count * archetypePct);
      this.aggregateUsers.byArchetype[archetype] = Math.max(0, this.aggregateUsers.byArchetype[archetype] - archetypeChurn);
    }
    
    this.aggregateUsers.total = Math.max(0, this.aggregateUsers.total - count);
  }

  getAggregateUsers(): AggregateUserData {
    return { ...this.aggregateUsers };
  }

  getUserCount(): number {
    return this.aggregateUsers.total;
  }

  // ============================================================================
  // SAMPLE POOL (For behavioral simulation with minimal memory)
  // ============================================================================

  addToSamplePool(user: any): boolean {
    if (this.samplePool.size >= this.MAX_SAMPLE_SIZE) {
      return false;
    }
    this.samplePool.set(user.id, user);
    return true;
  }

  getSamplePool(): Map<string, any> {
    return this.samplePool;
  }

  getSampleSize(): number {
    return this.samplePool.size;
  }

  removeFromSamplePool(userId: string): void {
    this.samplePool.delete(userId);
  }

  // ============================================================================
  // SNAPSHOT STORAGE (Compressed in Pocket Dimension)
  // ============================================================================

  async saveSnapshot(day: number, metrics: Record<string, any>): Promise<void> {
    if (!this.pocket) return;
    
    const snapshot: SimulationSnapshot = {
      day,
      timestamp: new Date(),
      users: this.getAggregateUsers(),
      revenue: {
        daily: metrics.revenue?.daily || 0,
        monthly: metrics.revenue?.mrr || 0,
        yearly: metrics.revenue?.arr || 0,
        lifetime: metrics.revenue?.lifetime || 0,
      },
      metrics: {
        streams: metrics.streams?.total || 0,
        viralReleases: metrics.streams?.viralReleases || 0,
        socialPosts: metrics.autonomous?.postsAutoPublished || 0,
        releases: metrics.autonomous?.releasesAutoDistributed || 0,
      },
    };
    
    try {
      await this.pocket.write(
        `snapshots/day-${day.toString().padStart(5, '0')}.json`,
        JSON.stringify(snapshot)
      );
      this.snapshotCount++;
    } catch (error) {
      // Pocket storage failed, continue without persistence
    }
  }

  async loadSnapshot(day: number): Promise<SimulationSnapshot | null> {
    if (!this.pocket) return null;
    
    try {
      const data = await this.pocket.read(`snapshots/day-${day.toString().padStart(5, '0')}.json`);
      return JSON.parse(data.toString());
    } catch {
      return null;
    }
  }

  async getAllSnapshots(): Promise<SimulationSnapshot[]> {
    if (!this.pocket) return [];
    
    const snapshots: SimulationSnapshot[] = [];
    const entries = await this.pocket.list('snapshots/');
    
    for (const entry of entries) {
      try {
        const data = await this.pocket.read(entry.path);
        snapshots.push(JSON.parse(data.toString()));
      } catch {
        // Skip corrupted snapshots
      }
    }
    
    return snapshots.sort((a, b) => a.day - b.day);
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async getStorageStats(): Promise<{
    memoryUsers: number;
    aggregateUsers: number;
    snapshotCount: number;
    compressionRatio: number;
    estimatedMemorySavings: string;
  }> {
    const pocketStats = this.pocket?.getStats();
    
    // Calculate memory savings
    // Without pocket: ~500 bytes per user object * total users
    // With pocket: aggregate tracking = ~200 bytes total + compressed snapshots
    const withoutPocket = this.aggregateUsers.total * 500;
    const withPocket = 200 + (pocketStats?.compressedSize || 0);
    const savings = withoutPocket > 0 ? ((withoutPocket - withPocket) / withoutPocket) * 100 : 0;
    
    return {
      memoryUsers: this.samplePool.size,
      aggregateUsers: this.aggregateUsers.total,
      snapshotCount: this.snapshotCount,
      compressionRatio: pocketStats?.compressionRatio || 1,
      estimatedMemorySavings: `${savings.toFixed(1)}%`,
    };
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async close(): Promise<void> {
    if (this.pocket) {
      await pocketManager.closePocket(`sim-${this.simulationId}`);
      this.pocket = null;
    }
    this.samplePool.clear();
    this.isInitialized = false;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPocketStorage(simulationId: string): PocketSimulationStorage {
  return new PocketSimulationStorage(simulationId);
}
