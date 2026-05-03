import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';
import { isPdimConfigured } from '../lib/pdimClient.js';
import { SLIDING_WINDOW_LUA } from './slidingWindowLua.js';

const _passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Minimal Redis interface required by the sliding-window ZSET algorithm.
 * Matches the subset of the PDIM client surface used by DistributedRateLimiter.
 */
export interface SlidingWindowRedis {
  /** Atomic Lua eval — one round-trip, races eliminated at the server. */
  eval(script: string, numkeys: number | string, ...args: unknown[]): Promise<unknown>;
  /**
   * Remove expired members (score < windowStart) — prunes out-of-window entries
   * so the ZSET stays bounded to at most maxRequests members on hot keys.
   * Returns the removal count, or null if the backend doesn't support this command
   * (e.g. PDIM returns HTTP 400 for ZREMRANGEBYSCORE → exec() returns null).
   */
  zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number | null>;
  /** Count surviving (in-window) members; used after a successful zremrangebyscore. */
  zcard(key: string): Promise<number>;
  /**
   * Count members with score in [min, max] — used as the fallback count when
   * zremrangebyscore is not supported (PDIM returns null for that command).
   * Correctly counts only in-window entries even without explicit pruning.
   */
  zcount(key: string, min: string | number, max: string | number): Promise<number>;
  zadd(key: string, ...args: unknown[]): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onRateLimit?: (req: Request, res: Response) => void;
}

const isProductionEnv = (): boolean =>
  process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

const isDevelopmentMode = (): boolean => !isProductionEnv();

// Throttle: log "PDIM congested" at most once per 30 s across all rate-limiter instances.
let _lastRateLimitCongestionWarnAt = 0;
const RATE_LIMIT_CONGESTION_THROTTLE_MS = 30_000;

const isLoadTestMode = (): boolean =>
  process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';

const skipRateLimiting = (req: Request): boolean => {
  if (isDevelopmentMode()) return true;
  if (isLoadTestMode()) return true;

  const path = req.path;

  if (path.startsWith('/api/health')) return true;
  if (path === '/api/version') return true;
  if (path.startsWith('/api/monitoring')) return true;
  if (path.startsWith('/api/system')) return true;

  // Session maintenance endpoints — exempt from global rate limiting
  // They have their own dedicated auth rate limiter
  if (path === '/api/auth/refresh-token') return true;
  if (path === '/api/auth/me') return true;
  if (path === '/api/auth/heartbeat') return true;

  if (path.startsWith('/@fs/')) return true;
  if (path.startsWith('/src/')) return true;
  if (path.startsWith('/node_modules/')) return true;
  if (path.startsWith('/@vite/')) return true;
  if (path.startsWith('/@react-refresh')) return true;
  if (path.startsWith('/@replit/')) return true;

  return false;
};

export class DistributedRateLimiter {
  private config: RateLimiterConfig;
  private redisClient: SlidingWindowRedis;

  constructor(config: RateLimiterConfig, redisClient: SlidingWindowRedis) {
    this.config = config;
    this.redisClient = redisClient;
  }

  async isRateLimited(key: string): Promise<{ limited: boolean; remaining: number }> {
    const redisKey = `ratelimit:sw:${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    // Key auto-expires well after the window closes — avoids stale ZSET accumulation.
    const windowExpireSecs = Math.ceil(this.config.windowMs / 1000) + 60;
    // Unique member prevents score-collision loss when multiple callers land on
    // the same millisecond (common under high concurrency).
    const entryId = `${now}:${Math.random().toString(36).slice(2, 9)}`;

    // Primary path: atomic EVAL — single PDIM round-trip, no race window.
    // The Lua script runs ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE in one
    // operation, making the check-and-increment indivisible.
    try {
      const raw = await this.redisClient.eval(
        SLIDING_WINDOW_LUA,
        1,
        redisKey,
        String(windowStart),
        String(this.config.maxRequests),
        String(now),
        entryId,
        String(windowExpireSecs),
      );
      const result = Array.isArray(raw) ? raw : [];
      const limited   = Number(result[0] ?? 1) === 1;
      const remaining = Number(result[1] ?? 0);
      return { limited, remaining };
    } catch {
      // Fallback: EVAL unsupported (backend returned HTTP 400) or PDIM transient
      // error.  Mirror the Lua script's ZREMRANGEBYSCORE + ZCARD algorithm to keep
      // the ZSET bounded.  On backends where ZREMRANGEBYSCORE is also unsupported
      // (PDIM returns HTTP 400 → exec() returns null rather than throwing), fall
      // through to ZCOUNT which counts only in-window members without pruning.
      // ZCOUNT is always supported by PDIM and gives correct rate-limit decisions;
      // ZREMRANGEBYSCORE prunes old entries when available to bound ZSET growth.
      const pruned = await this.redisClient.zremrangebyscore(redisKey, '-inf', windowStart - 1);
      const count = (pruned !== null)
        ? await this.redisClient.zcard(redisKey)           // pruned → ZCARD is exact
        : await this.redisClient.zcount(redisKey, windowStart, '+inf'); // no prune → ZCOUNT
      if (count >= this.config.maxRequests) return { limited: true, remaining: 0 };
      await this.redisClient.zadd(redisKey, now, entryId);
      // Fire-and-forget: expiry is a GC safety net, not on the critical path.
      Promise.resolve(this.redisClient.expire(redisKey, windowExpireSecs)).catch(() => {});
      return { limited: false, remaining: this.config.maxRequests - count - 1 };
    }
  }

  middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (this.config.skip?.(req)) {
        next();
        return;
      }

      const key = this.config.keyGenerator?.(req) || req.ip || 'unknown';

      let result: { limited: boolean; remaining: number };
      try {
        result = await this.isRateLimited(key);
      } catch (err) {
        // PDIM queue temporarily congested — pass request through uncounted rather
        // than fail it. PDIM is always reachable; this is transient backpressure.
        const now = Date.now();
        if (now - _lastRateLimitCongestionWarnAt >= RATE_LIMIT_CONGESTION_THROTTLE_MS) {
          _lastRateLimitCongestionWarnAt = now;
          logger.warn('[RateLimit] PDIM congested — passing request through uncounted:', (err as Error).message);
        }
        result = { limited: false, remaining: -1 };
      }

      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (result.limited) {
        if (this.config.onRateLimit) {
          this.config.onRateLimit(req, res);
        } else {
          res.status(429).json({
            error: 'Too many requests',
            retryAfter: Math.ceil(this.config.windowMs / 1000),
          });
        }
        return;
      }

      next();
    };
  }
}

function buildDistributedGlobal(
  windowMs: number,
  maxRequests: number,
  keyPrefix = 'global'
): RequestHandler {
  if (!isPdimConfigured()) {
    logger.warn(`[RateLimiter] PDIM not configured — ${keyPrefix} rate limiter disabled (dev mode)`);
    return _passThrough;
  }
  const redisClient = getRedisClient();

  const limiter = new DistributedRateLimiter(
    {
      windowMs,
      maxRequests,
      skip: skipRateLimiting,
      keyGenerator: (req) => {
        const userId = (req as Record<string, unknown>).user?.id;
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return `${keyPrefix}:${userId ?? ip}`;
      },
    },
    redisClient as SlidingWindowRedis,
  );

  return limiter.middleware();
}

export const createScalableRateLimiter = (overrides?: Partial<RateLimiterConfig>): RequestHandler => {
  if (!isPdimConfigured()) {
    logger.warn(`[RateLimiter] PDIM not configured — custom rate limiter disabled (dev mode)`);
    return _passThrough;
  }
  const redisClient = getRedisClient();

  // Default: 1,200 req/min per user/IP (20 req/s) — generous for normal use,
  // effective against bots. Callers pass `overrides` to narrow further.
  const limiter = new DistributedRateLimiter(
    {
      windowMs: 60000,
      maxRequests: 1_200,
      skip: skipRateLimiting,
      keyGenerator: (req) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const userId = (req as Record<string, unknown>).user?.id;
        return userId ? `user:${userId}` : `ip:${ip}`;
      },
      onRateLimit: (req, res) => {
        logger.warn(`Rate limit exceeded: ${req.ip} on ${req.path}`);
        res.status(429).json({
          error: 'Too many requests',
          message: 'You have exceeded the rate limit. Please wait and try again.',
          retryAfter: 60,
        });
      },
      ...overrides,
    },
    redisClient as SlidingWindowRedis,
  );

  return limiter.middleware();
};

// Per-user/IP limits — keyed by authenticated user ID when present, else IP.
// These protect against runaway clients and bots without throttling normal use.
const GLOBAL_PER_USER_PER_MIN  = 1_200;   // 20 req/s — covers all authenticated use cases
const AI_PER_USER_PER_MIN      =    60;   // 1 req/s — AI is compute-heavy, lower ceiling

export const globalScalableRateLimiter = buildDistributedGlobal(60000, GLOBAL_PER_USER_PER_MIN, 'global');

export const apiRateLimiter = buildDistributedGlobal(60000, GLOBAL_PER_USER_PER_MIN, 'api');

export const aiRateLimiter = buildDistributedGlobal(60000, AI_PER_USER_PER_MIN, 'ai');

export const authRateLimiter = buildDistributedGlobal(900000, 200, 'auth');

export const createHighScaleRateLimiter = (
  tier: 'monthly' | 'yearly' | 'lifetime' | 'unlimited'
): RequestHandler => {
  // Tiered limits scale with subscription value.
  // Even "unlimited" is capped to prevent runaway clients from monopolising compute.
  const limits = {
    monthly:   { windowMs: 60000, maxRequests:  2_400 },  //  40 req/s
    yearly:    { windowMs: 60000, maxRequests:  6_000 },  // 100 req/s
    lifetime:  { windowMs: 60000, maxRequests: 18_000 },  // 300 req/s
    unlimited: { windowMs: 60000, maxRequests: 60_000 },  //   1K req/s
  };

  return createScalableRateLimiter({
    ...limits[tier],
    skip: skipRateLimiting,
    keyGenerator: (req) => {
      const userId = (req as Record<string, unknown>).user?.id;
      return userId ? `${tier}:${userId}` : `${tier}:${req.ip}`;
    },
  });
};

export const adaptiveRateLimiter = (): RequestHandler => {
  let currentMultiplier = 1.0;
  let requestCount = 0;
  let lastCheck = Date.now();

  const baseLimit = 5000;

  return createScalableRateLimiter({
    windowMs: 60000,
    maxRequests: baseLimit,
    skip: (req) => {
      if (skipRateLimiting(req)) return true;

      requestCount++;
      const now = Date.now();

      if (now - lastCheck > 10000) {
        const rps = requestCount / ((now - lastCheck) / 1000);

        if (rps > 1000) {
          currentMultiplier = Math.max(0.5, currentMultiplier * 0.9);
        } else if (rps < 100) {
          currentMultiplier = Math.min(2.0, currentMultiplier * 1.1);
        }

        requestCount = 0;
        lastCheck = now;
      }

      return false;
    },
  });
};
