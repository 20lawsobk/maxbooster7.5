import { logger } from '../logger.js';
import type { Redis } from 'ioredis';

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
      logger.warn('[DistributedCache] REDIS_URL not set — using in-memory cache');
      return;
    }

    try {
      const { default: Redis } = await import('ioredis');
      this.redis = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,
        keyPrefix: 'cache:',
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 300, 3000);
        },
      });

      this.redis.on('ready', () => {
        this._redisReady = true;
        logger.info('✅ [DistributedCache] Redis backend connected (shared cross-instance cache active)');
      });

      this.redis.on('error', (err) => {
        this._redisReady = false;
        logger.warn(`[DistributedCache] Redis error — falling back to in-memory: ${err.message}`);
      });

      this.redis.on('close', () => {
        this._redisReady = false;
      });

      await this.redis.ping();
      this._redisReady = true;
      logger.info('✅ [DistributedCache] Redis backend ready');
    } catch (err: any) {
      logger.warn(`[DistributedCache] Could not connect to Redis (${err.message}) — using in-memory cache`);
      this.redis = null;
      this._redisReady = false;
    }
  }

  get isRedisConnected(): boolean {
    return this._redisReady;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      let value: string | null = null;

      if (this.redis && this._redisReady) {
        value = await this.redis.get(key);
      } else {
        value = await this.fallbackCache.get(key);
      }

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

    try {
      if (this.redis && this._redisReady) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.fallbackCache.set(key, serialized, ttl);
      }
      this.stats.size++;
    } catch {
      await this.fallbackCache.set(key, serialized, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      if (this.redis && this._redisReady) {
        await this.redis.del(key);
      } else {
        await this.fallbackCache.del(key);
      }
    } catch {
      await this.fallbackCache.del(key);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
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
      const keys = await this.fallbackCache.keys(pattern);
      for (const key of keys) await this.fallbackCache.del(key);
      return keys.length;
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

  async flush(): Promise<void> {
    try {
      if (this.redis && this._redisReady) {
        await this.redis.flushdb();
      } else {
        await this.fallbackCache.flushAll();
      }
      this.stats.size = 0;
    } catch {
      await this.fallbackCache.flushAll();
    }
  }

  getStats(): CacheStats & { mode: string; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';
    return {
      ...this.stats,
      mode: this._redisReady ? 'redis' : 'in-memory',
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
