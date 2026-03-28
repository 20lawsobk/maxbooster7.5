import { logger } from '../logger.js';
import type { Redis } from 'ioredis';
import { applyIoredisCompatShim } from '../lib/redisCompat.js';
import { getPdimClient } from '../lib/pdimClient.js';

interface CacheConfig {
  defaultTTL: number;
  maxMemoryMB: number;
  enableCompression: boolean;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  memoryUsage: number;
}

export class DistributedCache {
  private static instance: DistributedCache;
  private redis!: Redis;
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, memoryUsage: 0 };

  // L1 in-process cache — eliminates PDIM round-trips for hot keys.
  // TTL is capped at 4s — acceptable staleness for session/cache reads;
  // still well below any user-visible consistency window.
  // L1_MAX raised to 5000 to absorb larger hot-key sets without evicting.
  private l1 = new Map<string, { raw: string; expiresAt: number }>();
  private readonly L1_MAX    = 5_000;
  private readonly L1_TTL_MS = 4_000;
  private l1PrunedAt = Date.now();

  private l1Get(key: string): string | null {
    const entry = this.l1.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.l1.delete(key); return null; }
    return entry.raw;
  }

  private l1Set(key: string, raw: string): void {
    const now = Date.now();
    if (now - this.l1PrunedAt > 10_000) {
      for (const [k, v] of this.l1) { if (now > v.expiresAt) this.l1.delete(k); }
      this.l1PrunedAt = now;
    }
    if (this.l1.size >= this.L1_MAX) {
      const oldest = this.l1.keys().next().value;
      if (oldest) this.l1.delete(oldest);
    }
    this.l1.set(key, { raw, expiresAt: now + this.L1_TTL_MS });
  }

  private l1Del(key: string): void { this.l1.delete(key); }

  private constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL || 300,
      maxMemoryMB: config.maxMemoryMB || 512,
      enableCompression: config.enableCompression ?? true,
    };
  }

  static getInstance(config?: Partial<CacheConfig>): DistributedCache {
    if (!DistributedCache.instance) {
      DistributedCache.instance = new DistributedCache(config);
    }
    return DistributedCache.instance;
  }

  async connect(): Promise<void> {
    this.redis = getPdimClient() as any;
    applyIoredisCompatShim(this.redis);
    logger.info('✅ [DistributedCache] Connected (PDIM)');
  }

  get isRedisConnected(): boolean {
    return !!this.redis;
  }

  async get<T>(key: string): Promise<T | null> {
    // L1 — nanosecond in-process lookup (no network)
    const l1raw = this.l1Get(key);
    if (l1raw !== null) {
      this.stats.hits++;
      return JSON.parse(l1raw) as T;
    }

    const value = await this.redis.get(key);
    if (value) {
      this.l1Set(key, value);
      this.stats.hits++;
      return JSON.parse(value) as T;
    }
    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.defaultTTL;
    const serialized = JSON.stringify(value);

    // Always populate L1 on write
    this.l1Set(key, serialized);

    await this.redis.setex(key, ttl, serialized);
    this.stats.size++;
  }

  async delete(key: string): Promise<void> {
    this.l1Del(key);
    await this.redis.del(key);
  }

  async invalidatePattern(pattern: string): Promise<number> {
    // Evict matching L1 entries synchronously
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.l1.keys()) { if (regex.test(key)) this.l1.delete(key); }

    const keys = await this.redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      const stripped = keys.map(k => k.replace(/^cache:/, ''));
      await this.redis.del(...stripped);
      return stripped.length;
    }
    return 0;
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async getOrSetWithLock<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number,
    lockTtlSeconds: number = 10,
    _attempt: number = 0
  ): Promise<T> {
    const MAX_WAIT_ATTEMPTS = 50;

    // 1. Check cache — return hit
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const lockKey = `lock:${key}`;

    // 2. Try to acquire SETNX lock
    const acquired = await this.redis.set(lockKey, 'locked', 'EX', lockTtlSeconds, 'NX');

    if (!acquired) {
      // 3. Lock is held by another request — wait and retry cache check
      if (_attempt >= MAX_WAIT_ATTEMPTS) {
        // Waited 5s (50 × 100ms) — lock holder is stuck or dead; fetch directly
        logger.warn(`[DistributedCache] Lock wait exceeded for key ${key}, fetching directly`);
        return this.getOrSet(key, fetcher, ttlSeconds);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getOrSetWithLock(key, fetcher, ttlSeconds, lockTtlSeconds, _attempt + 1);
    }

    // 4. Lock acquired — run fetcher, cache result, release
    try {
      const value = await fetcher();
      await this.set(key, value, ttlSeconds);
      return value;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async flush(): Promise<void> {
    await this.redis.flushdb();
    this.stats.size = 0;
  }

  getStats(): CacheStats & { mode: string; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';
    return {
      ...this.stats,
      mode: 'pdim',
      hitRate: `${hitRate}%`,
    };
  }

  isConnected(): boolean {
    return !!this.redis;
  }

  async disconnect(): Promise<void> {
    // PDIM client is shared — do not close it here
    logger.info('[DistributedCache] disconnect() called — PDIM client is shared and remains open');
  }
}

export const distributedCache = DistributedCache.getInstance();
