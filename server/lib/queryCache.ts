/**
 * Query Result Caching Layer
 *
 * Caches frequently-run queries to reduce database load.
 * Particularly effective for:
 * - Health check queries (every 60s)
 * - Analytics summaries (every 5min)
 * - Monitoring metrics (various intervals)
 *
 * Uses PDIM (via Redis client) exclusively. PDIM is always reachable.
 */

import { getRedisClient } from './redisConnectionFactory.js';

const DEFAULT_TTL = 60; // 60 seconds

class QueryCache {
  /**
   * Get cached query result
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = await getRedisClient();
    const cached = await redis.get(`qcache:${key}`);
    return cached ? (JSON.parse(cached) as T) : null;
  }

  /**
   * Set cached query result
   */
  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? DEFAULT_TTL;
    const redis = await getRedisClient();
    await redis.setex(`qcache:${key}`, ttl, JSON.stringify(data));
  }

  /**
   * Get or compute: fetch from cache or execute query and cache result
   */
  async getOrCompute<T>(key: string, computeFn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const result = await computeFn();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  /**
   * Invalidate a specific cache key
   */
  async invalidate(key: string): Promise<void> {
    const redis = await getRedisClient();
    await redis.del(`qcache:${key}`);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const redis = await getRedisClient();
    const keys = await redis.keys(`qcache:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Clear all cached queries
   */
  async clear(): Promise<void> {
    const redis = await getRedisClient();
    const keys = await redis.keys('qcache:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      backend: 'PDIM',
    };
  }
}

// Export singleton instance
export const queryCache = new QueryCache();

/**
 * Helper: Create cache key from query components
 */
export function createCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}
