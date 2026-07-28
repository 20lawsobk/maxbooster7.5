/**
 * Query Result Caching Layer
 *
 * Caches frequently-run queries to reduce database load.
 * Particularly effective for:
 * - Health check queries (every 60s)
 * - Analytics summaries (every 5min)
 * - Monitoring metrics (various intervals)
 *
 * Uses PDIM (via Redis client) exclusively. PDIM is the cache substrate, but
 * ALL operations here are best-effort: PDIM congestion / transient failure
 * must NEVER fail the calling request. `get` returns null (treat as cache miss),
 * `set`/`invalidate`/`invalidatePattern`/`clear` log+swallow. `getOrCompute`
 * still runs the compute on cache failure.
 */

import { getRedisClient } from "./redisConnectionFactory.js";
import { logger } from "../logger.js";

const DEFAULT_TTL = 60; // 60 seconds

// Throttle: don't spam pino once per request when PDIM is degraded across the cluster.
let _lastWarnAt = 0;
const WARN_THROTTLE_MS = 30_000;

function warnOnce(op: string, err: unknown): void {
  const now = Date.now();
  if (now - _lastWarnAt < WARN_THROTTLE_MS) return;
  _lastWarnAt = now;
  const msg = err instanceof Error ? err.message : String(err);
  logger.warn(`[QueryCache] PDIM ${op} failed (best-effort) — ${msg}`);
}

class QueryCache {
  /**
   * Get cached query result. Returns null on cache miss OR on PDIM failure
   * (failure is treated as a miss so callers fall through to the DB path).
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = await getRedisClient();
      const cached = await redis.get(`qcache:${key}`);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch (err) {
      warnOnce("get", err);
      return null;
    }
  }

  /**
   * Set cached query result. Best-effort — failures are logged and swallowed
   * so a PDIM hiccup during cache priming doesn't fail the parent request.
   */
  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? DEFAULT_TTL;
    try {
      const redis = await getRedisClient();
      await redis?.setex(`qcache:${key}`, ttl, JSON.stringify(data));
    } catch (err) {
      warnOnce("set", err);
    }
  }

  /**
   * Get or compute: fetch from cache or execute query and cache result.
   * If the cache get/set fails, the compute still runs and its value is
   * returned uncached — the caller sees no error.
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const result = await computeFn();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  /**
   * Invalidate a specific cache key. Best-effort.
   */
  async invalidate(key: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      await redis?.del(`qcache:${key}`);
    } catch (err) {
      warnOnce("invalidate", err);
    }
  }

  /**
   * Invalidate all cache entries matching a pattern. Best-effort.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      const keys = await redis?.keys(`qcache:${pattern}`);
      if (keys?.length > 0) {
        await redis?.del(...keys);
      }
    } catch (err) {
      warnOnce("invalidatePattern", err);
    }
  }

  /**
   * Clear all cached queries. Best-effort.
   */
  async clear(): Promise<void> {
    try {
      const redis = await getRedisClient();
      const keys = await redis?.keys("qcache:*");
      if (keys?.length > 0) {
        await redis?.del(...keys);
      }
    } catch (err) {
      warnOnce("clear", err);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      backend: "PDIM",
    };
  }
}

// Export singleton instance
export const queryCache = new QueryCache();

/**
 * Helper: Create cache key from query components
 */
export function createCacheKey(
  prefix: string,
  ...parts: (string | number)[]
): string {
  return `${prefix}:${parts?.join(":")}`;
}
