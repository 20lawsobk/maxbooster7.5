import { logger } from '../logger.js';
import type { Redis } from 'ioredis';
import { applyIoredisCompatShim } from '../lib/redisCompat.js';

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

const isProductionEnv = (): boolean =>
  process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

class InMemoryCache {
  private cache: Map<string, { value: string; expires: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.cache.keys()).filter(k => regex.test(k));
  }

  async flushAll(): Promise<void> {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }
}

export class DistributedCache {
  private static instance: DistributedCache;
  private redis: Redis | null = null;
  private fallbackCache: InMemoryCache;
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, memoryUsage: 0 };
  private _redisReady = false;

  // L1 in-process cache — eliminates Redis round-trips for hot keys.
  // TTL is capped at 2 seconds so stale data propagates across workers quickly.
  private l1 = new Map<string, { raw: string; expiresAt: number }>();
  private readonly L1_MAX     = 2_000;
  private readonly L1_TTL_MS  = 2_000;
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
    this.fallbackCache = new InMemoryCache();
  }

  static getInstance(config?: Partial<CacheConfig>): DistributedCache {
    if (!DistributedCache.instance) {
      DistributedCache.instance = new DistributedCache(config);
    }
    return DistributedCache.instance;
  }

  async connect(): Promise<void> {
    const url = process.env.REDIS_URL;

    if (!url) {
      if (isProductionEnv()) {
        throw new Error(
          '[DistributedCache] REDIS_URL is required in production. ' +
          'Shared cache cannot function without Redis — per-instance in-memory caches diverge across cluster workers.'
        );
      }
      logger.warn('[DistributedCache] REDIS_URL not set — using in-memory cache (development only)');
      return;
    }

    try {
      const { default: Redis } = await import('ioredis');
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: false,
        keyPrefix: 'cache:',
        commandTimeout: 2000,
        connectTimeout: 5000,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 300, 2000);
        },
      });
      applyIoredisCompatShim(this.redis);

      this.redis.on('ready', () => {
        this._redisReady = true;
        logger.info('✅ [DistributedCache] Redis backend connected (shared cross-instance cache active)');
      });

      this.redis.on('error', (err) => {
        this._redisReady = false;
        if (isProductionEnv()) {
          logger.error(
            `[DistributedCache] Redis error in production — cache misses will be returned until Redis recovers. ` +
            `In-memory fallback is DISABLED in production to prevent cross-worker cache divergence. Error: ${err.message}`
          );
        } else {
          logger.warn(`[DistributedCache] Redis error (dev) — falling back to in-memory: ${err.message}`);
        }
      });

      this.redis.on('close', () => {
        this._redisReady = false;
      });

      await this.redis.ping();
      this._redisReady = true;
      logger.info('✅ [DistributedCache] Redis backend ready');
    } catch (err: any) {
      if (isProductionEnv()) {
        throw new Error(
          `[DistributedCache] Could not connect to Redis in production (${err.message}). ` +
          `Redis is required — cannot start without a shared cache layer.`
        );
      }
      logger.warn(`[DistributedCache] Could not connect to Redis (${err.message}) — using in-memory cache (dev only)`);
      this.redis = null;
      this._redisReady = false;
    }
  }

  get isRedisConnected(): boolean {
    return this._redisReady;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      // L1 — nanosecond in-process lookup (no network)
      const l1raw = this.l1Get(key);
      if (l1raw !== null) {
        this.stats.hits++;
        return JSON.parse(l1raw) as T;
      }

      if (this.redis && this._redisReady) {
        const value = await this.redis.get(key);
        if (value) {
          this.l1Set(key, value);   // populate L1 for subsequent requests
          this.stats.hits++;
          return JSON.parse(value) as T;
        }
        this.stats.misses++;
        return null;
      }

      if (isProductionEnv()) {
        // Redis is down in production — return a cache miss rather than reading from
        // a per-instance in-memory store that diverges across cluster workers.
        this.stats.misses++;
        return null;
      }

      const value = await this.fallbackCache.get(key);
      if (value) {
        this.stats.hits++;
        return JSON.parse(value) as T;
      }
      this.stats.misses++;
      return null;
    } catch {
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.defaultTTL;
    const serialized = JSON.stringify(value);

    // Always populate L1 on write regardless of Redis state
    this.l1Set(key, serialized);

    try {
      if (this.redis && this._redisReady) {
        await this.redis.setex(key, ttl, serialized);
        this.stats.size++;
        return;
      }

      if (isProductionEnv()) {
        // Redis is down — skip the write entirely rather than populating a per-instance cache
        // that would diverge from other cluster workers.
        logger.warn(`[DistributedCache] Skipping cache set for key "${key}" — Redis unavailable in production`);
        return;
      }

      await this.fallbackCache.set(key, serialized, ttl);
      this.stats.size++;
    } catch {
      if (isProductionEnv()) {
        // On Redis write error in production: skip, don't fall back.
        return;
      }
      await this.fallbackCache.set(key, serialized, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.l1Del(key);  // always evict from L1
    try {
      if (this.redis && this._redisReady) {
        await this.redis.del(key);
        return;
      }
      if (!isProductionEnv()) {
        await this.fallbackCache.del(key);
      }
    } catch {
      if (!isProductionEnv()) {
        await this.fallbackCache.del(key);
      }
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    // Evict matching L1 entries synchronously
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.l1.keys()) { if (regex.test(key)) this.l1.delete(key); }

    try {
      if (this.redis && this._redisReady) {
        const keys = await this.redis.keys(`cache:${pattern}`);
        if (keys.length > 0) {
          const stripped = keys.map(k => k.replace(/^cache:/, ''));
          await this.redis.del(...stripped);
          return stripped.length;
        }
        return 0;
      }
      if (!isProductionEnv()) {
        const keys = await this.fallbackCache.keys(pattern);
        for (const key of keys) await this.fallbackCache.del(key);
        return keys.length;
      }
      return 0;
    } catch {
      return 0;
    }
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

    // Fallback: no Redis — use plain getOrSet
    if (!this.redis || !this._redisReady) {
      return this.getOrSet(key, fetcher, ttlSeconds);
    }

    const lockKey = `lock:${key}`;

    try {
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
    } catch (error) {
      logger.error(`[DistributedCache] Lock error for key ${key}:`, error);
      return this.getOrSet(key, fetcher, ttlSeconds);
    }
  }

  async flush(): Promise<void> {
    try {
      if (this.redis && this._redisReady) {
        await this.redis.flushdb();
      } else if (!isProductionEnv()) {
        await this.fallbackCache.flushAll();
      }
      this.stats.size = 0;
    } catch {
      if (!isProductionEnv()) {
        await this.fallbackCache.flushAll();
      }
    }
  }

  getStats(): CacheStats & { mode: string; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';
    return {
      ...this.stats,
      mode: this._redisReady ? 'redis' : (isProductionEnv() ? 'cache-miss-only' : 'in-memory'),
      hitRate: `${hitRate}%`,
    };
  }

  isConnected(): boolean {
    return this._redisReady;
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    this._redisReady = false;
  }
}

export const distributedCache = DistributedCache.getInstance();
