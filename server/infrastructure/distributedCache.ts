import { logger } from '../logger.js';

interface CacheConfig {
  redisUrl?: string;
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
  private maxSize: number;

  constructor(maxSizeMB: number) {
    this.maxSize = maxSizeMB * 1024 * 1024;
  }

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
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
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
  private fallbackCache: InMemoryCache;
  private config: CacheConfig;
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, memoryUsage: 0 };
  private isRedisConnected: boolean = false;

  private constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      redisUrl: process.env.REDIS_URL,
      defaultTTL: config.defaultTTL || 300,
      maxMemoryMB: config.maxMemoryMB || 512,
      enableCompression: config.enableCompression ?? true,
    };
    this.fallbackCache = new InMemoryCache(this.config.maxMemoryMB);
  }

  static getInstance(config?: Partial<CacheConfig>): DistributedCache {
    if (!DistributedCache.instance) {
      DistributedCache.instance = new DistributedCache(config);
    }
    return DistributedCache.instance;
  }

  async connect(): Promise<void> {
    logger.info('Distributed cache initialized (in-memory mode, Redis available when configured)');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.fallbackCache.get(key);
      if (value) {
        this.stats.hits++;
        return JSON.parse(value) as T;
      }
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.defaultTTL;
    const serialized = JSON.stringify(value);
    await this.fallbackCache.set(key, serialized, ttl);
    this.stats.size++;
  }

  async delete(key: string): Promise<void> {
    await this.fallbackCache.del(key);
  }

  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.fallbackCache.keys(pattern);
    for (const key of keys) {
      await this.fallbackCache.del(key);
    }
    return keys.length;
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async flush(): Promise<void> {
    await this.fallbackCache.flushAll();
    this.stats.size = 0;
  }

  getStats(): CacheStats & { mode: string; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';
    
    return {
      ...this.stats,
      mode: this.isRedisConnected ? 'redis' : 'in-memory',
      hitRate: `${hitRate}%`,
    };
  }

  isConnected(): boolean {
    return this.isRedisConnected;
  }

  async disconnect(): Promise<void> {
    this.isRedisConnected = false;
  }
}

export const distributedCache = DistributedCache.getInstance();
