import rateLimit, { type Store, type Options, type IncrementResponse } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';

const RL_PREFIX = 'glrl:';

interface MemEntry { hits: number; resetAt: number; }

class RedisRateLimitStore implements Store {
  private windowMs: number;
  private maxRequests: number;
  private fallbackStore = new Map<string, MemEntry>();
  private fallbackPrunedAt = Date.now();

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.maxRequests = typeof options.max === 'number' ? options.max : this.maxRequests;
  }

  private fallbackIncrement(key: string): IncrementResponse {
    const now = Date.now();
    if (now - this.fallbackPrunedAt > 60_000) {
      for (const [k, v] of this.fallbackStore) {
        if (now > v.resetAt) this.fallbackStore.delete(k);
      }
      this.fallbackPrunedAt = now;
    }
    const entry = this.fallbackStore.get(key);
    if (!entry || now > entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.fallbackStore.set(key, { hits: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
  }

  async increment(key: string): Promise<IncrementResponse> {
    const rKey = `${RL_PREFIX}${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const entryId = `${now}:${Math.random().toString(36).slice(2, 9)}`;
    const windowExpireSecs = Math.ceil(this.windowMs / 1000) + 60;

    try {
      const redis = getRedisClient();
      // 400ms timeout — PDIM is highly available, but guard against transient blips.
      const totalHits = await Promise.race([
        (async () => {
          // Sliding-window ZSET: evict expired scores, count, then add the new entry.
          // This replaces the old INCR+EXPIRE fixed-window counter which:
          //   1. Had integer-second rounding (ceil) causing imprecise window boundaries
          //   2. Could allow boundary bursts when the counter reset between two windows
          await redis.zremrangebyscore(rKey, '-inf', windowStart);
          const count: number = await redis.zcard(rKey);
          await redis.zadd(rKey, now, entryId);
          redis.expire(rKey, windowExpireSecs).catch(() => {});
          return count + 1;
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('[GlobalRateLimit] Sliding-window ops timed out (400ms)')), 400)
        ),
      ]);
      const resetTime = new Date(now + this.windowMs);
      return { totalHits, resetTime };
    } catch {
      logger.warn('[GlobalRateLimit] Redis unavailable — using in-memory fallback');
      return this.fallbackIncrement(key);
    }
  }

  async decrement(key: string): Promise<void> {
    // With ZSET we undo an increment by removing the most-recently-added member
    // (highest score = most recent timestamp). ZREMRANGEBYRANK -1 -1 pops the top.
    const rKey = `${RL_PREFIX}${key}`;
    try {
      const redis = getRedisClient();
      await redis.zremrangebyrank(rKey, -1, -1);
    } catch {
      const entry = this.fallbackStore.get(key);
      if (entry && entry.hits > 0) entry.hits--;
    }
  }

  async resetKey(key: string): Promise<void> {
    this.fallbackStore.delete(key);
    try {
      const redis = getRedisClient();
      await redis.del(`${RL_PREFIX}${key}`);
    } catch {
      // Redis unavailable — in-memory fallback already cleared above
    }
  }
}

const globalStore = new RedisRateLimitStore(
  config.rateLimiting.windowMs,
  config.rateLimiting.maxRequests
);
const criticalStore = new RedisRateLimitStore(
  config.rateLimiting.windowMs,
  config.rateLimiting.criticalMax
);

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  store: globalStore,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the request limit. Please slow down and try again later.',
    retryAfter: `${Math.ceil(config.rateLimiting.windowMs / 1000)} seconds`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req: Request) => {
    const isDevelopment = process.env.NODE_ENV !== 'production' && !process.env.REPLIT_DEPLOYMENT;
    const isMonitoringEndpoint =
      req.path.startsWith('/api/monitoring/') || req.path.startsWith('/api/system/');
    const isStaticAsset =
      req.path.startsWith('/@fs/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/@vite/') ||
      req.path.startsWith('/@react-refresh') ||
      req.path.startsWith('/@replit/');
    const isLocalhost =
      req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' ||
      (typeof req.ip === 'string' && req.ip.startsWith('10.'));
    const isSessionMaintenance =
      req.path === '/api/auth/refresh-token' ||
      req.path === '/api/auth/me' ||
      req.path === '/api/auth/heartbeat';

    if (isMonitoringEndpoint) return true;
    if (isDevelopment) return true;
    if (isLocalhost) return true;
    if (isSessionMaintenance) return true;
    return isStaticAsset;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`⚠️ Global rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the request limit. Please slow down and try again later.',
      retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000),
    });
  },
});

export const criticalEndpointLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.criticalMax,
  store: criticalStore,
  message: {
    error: 'Too many requests to critical endpoint',
    message: 'This endpoint is rate-limited. Please try again later.',
  },
  validate: { trustProxy: false },
  skip: (req: Request) => {
    return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' ||
      (typeof req.ip === 'string' && req.ip.startsWith('10.'));
  },
});
