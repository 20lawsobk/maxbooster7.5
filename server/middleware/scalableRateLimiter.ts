import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';
import { isPdimConfigured } from '../lib/pdimClient.js';

const _passThrough: RequestHandler = (_req, _res, next) => next();

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
  private redisClient: Record<string, unknown>;

  constructor(config: RateLimiterConfig, redisClient: Record<string, unknown>) {
    this.config = config;
    this.redisClient = redisClient;
  }

  async isRateLimited(key: string): Promise<{ limited: boolean; remaining: number }> {
    const redisKey = `ratelimit:sw:${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    // Key expires automatically well after the window — avoids stale ZSET accumulation.
    const windowExpireSecs = Math.ceil(this.config.windowMs / 1000) + 60;

    // Sliding-window ZSET algorithm (sub-millisecond precision):
    //   1. Evict timestamps that have fallen outside [now - windowMs, now]
    //   2. Count remaining entries — that is the current request tally
    //   3. If under limit: add current timestamp with a unique member and allow
    //
    // Using the score as the epoch-ms timestamp means ZREMRANGEBYSCORE precisely
    // tracks the rolling window without the rounding loss of INCR+EXPIRE
    // (which must ceil windowMs → whole seconds and is therefore imprecise).
    // Firing requests at a window boundary cannot create a >1× burst because
    // entries only age out when their score is strictly older than windowMs.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redis = this.redisClient as any;

    await redis.zremrangebyscore(redisKey, '-inf', windowStart);
    const count: number = await redis.zcard(redisKey);

    if (count >= this.config.maxRequests) {
      return { limited: true, remaining: 0 };
    }

    // Unique member prevents score-collision collisions from different callers
    // hitting the same millisecond (common under high concurrency).
    const entryId = `${now}:${Math.random().toString(36).slice(2, 9)}`;
    await redis.zadd(redisKey, now, entryId);
    // Fire-and-forget: key expiry is a safety net, not on the critical path.
    redis.expire(redisKey, windowExpireSecs).catch(() => {});

    return { limited: false, remaining: this.config.maxRequests - count - 1 };
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
    redisClient
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
    redisClient
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
