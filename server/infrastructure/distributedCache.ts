import { createClient, RedisClientType } from 'redis';
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

class InMemoryFallback {
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
    const regex = new RegExp(pattern.replace('*', '.*'));
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
  private redisClient: RedisClientType | null = null;
  private fallbackCache: InMemoryFallback;
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
    this.fallbackCache = new InMemoryFallback(this.config.maxMemoryMB);
  }

  static getInstance(config?: Partial<CacheConfig>): DistributedCache {
    if (!DistributedCache.instance) {
      DistributedCache.instance = new DistributedCache(config);
    }
    return DistributedCache.instance;
  }

  async connect(): Promise<void> {
    if (!this.config.redisUrl) {
      logger.info('No Redis URL configured, using in-memory fallback cache');
      return;
    }

    try {
      this.redisClient = createClient({ url: this.config.redisUrl });
      
      this.redisClient.on('error', (err) => {
        logger.error('Redis connection error:', err);
        this.isRedisConnected = false;
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
        this.isRedisConnected = true;
      });

      await this.redisClient.connect();
      this.isRedisConnected = true;
      logger.info('Distributed cache initialized with Redis');
    } catch (error) {
      logger.warn('Failed to connect to Redis, using in-memory fallback:', error);
      this.isRedisConnected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      let value: string | null;
      
      if (this.isRedisConnected && this.redisClient) {
        value = await this.redisClient.get(key);
      } else {
        value = await this.fallbackCache.get(key);
      }

      if (value) {
        this.stats.hits++;
        return JSON.parse(value) as T;
      }
      
      this.stats.misses++;
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.defaultTTL;
    const serialized = JSON.stringify(value);

    try {
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.setEx(key, ttl, serialized);
      } else {
        await this.fallbackCache.set(key, serialized, ttl);
      }
      this.stats.size++;
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.del(key);
      } else {
        await this.fallbackCache.del(key);
      }
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      if (this.isRedisConnected && this.redisClient) {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
        return keys.length;
      } else {
        const keys = await this.fallbackCache.keys(pattern);
        for (const key of keys) {
          await this.fallbackCache.del(key);
        }
        return keys.length;
      }
    } catch (error) {
      logger.error('Cache invalidate pattern error:', error);
      return 0;
    }
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
    try {
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.flushAll();
      } else {
        await this.fallbackCache.flushAll();
      }
      this.stats.size = 0;
    } catch (error) {
      logger.error('Cache flush error:', error);
    }
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
    if (this.redisClient) {
      await this.redisClient.quit();
      this.isRedisConnected = false;
    }
  }
}

export const distributedCache = DistributedCache.getInstance();
