/**
 * Query Result Caching Layer
 *
 * Caches frequently-run queries to reduce database load.
 * Particularly effective for:
 * - Health check queries (every 60s)
 * - Analytics summaries (every 5min)
 * - Monitoring metrics (various intervals)
 *
 * Uses Redis when available, falls back to in-memory cache.
 */

import { getRedisClient } from './redisConnectionFactory.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class QueryCache {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 60; // 60 seconds
  private readonly MAX_MEMORY_ENTRIES = 1000;

  /**
   * Get cached query result
   */
  async get<T>(key: string): Promise<T | null> {
    // Try Redis first (if available)
    try {
      const redis = await getRedisClient();
      if (redis) {
        const cached = await redis.get(`qcache:${key}`);
        if (cached) {
          return JSON.parse(cached) as T;
        }
      }
    } catch (error: unknown) {
      // Fall through to memory cache
    }

    // Fall back to memory cache
    const entry = this.memoryCache.get(key);
    if (entry) {
      const now = Date.now();
      if (now - entry.timestamp < entry.ttl * 1000) {
        return entry.data as T;
      } else {
        // Expired entry
        this.memoryCache.delete(key);
      }
    }

    return null;
  }

  /**
   * Set cached query result
   */
  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.DEFAULT_TTL;

    // Try Redis first (if available)
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.setex(`qcache:${key}`, ttl, JSON.stringify(data));
        return; // Success - don't also cache in memory
      }
    } catch (error: unknown) {
      // Fall through to memory cache
    }

    // Fall back to memory cache
    // Evict oldest entries if at capacity
    if (this.memoryCache.size >= this.MAX_MEMORY_ENTRIES) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Get or compute: fetch from cache or execute query and cache result
   */
  async getOrCompute<T>(key: string, computeFn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - compute the result
    const result = await computeFn();

    // Cache the result
    await this.set(key, result, ttlSeconds);

    return result;
  }

  /**
   * Invalidate a specific cache key
   */
  async invalidate(key: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.del(`qcache:${key}`);
      }
    } catch (error: unknown) {
      // Fall through
    }

    this.memoryCache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        const keys = await redis.keys(`qcache:${pattern}`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error: unknown) {
      // Fall through
    }

    // Memory cache pattern matching
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Clear all cached queries
   */
  async clear(): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        const keys = await redis.keys('qcache:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error: unknown) {
      // Fall through
    }

    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      maxMemoryEntries: this.MAX_MEMORY_ENTRIES,
      utilizationPercent: Math.round((this.memoryCache.size / this.MAX_MEMORY_ENTRIES) * 100),
    };
  }
}

// Export singleton instance
export const queryCache = new QueryCache();

/**
 * Helper: Create cache key from query components
 */
/**
 * TODO: Add function documentation
 */
export function createCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}
