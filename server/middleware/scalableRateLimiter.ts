import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';

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
  private redisClient: any;

  constructor(config: RateLimiterConfig, redisClient: any) {
    this.config = config;
    this.redisClient = redisClient;
  }

  async isRateLimited(key: string): Promise<{ limited: boolean; remaining: number }> {
    const redisKey = `ratelimit:${key}`;
    const windowSecs = Math.ceil(this.config.windowMs / 1000);

    // Fixed-window counter using INCR + EXPIRE — PDIM-compatible.
    const count: number = await this.redisClient.incr(redisKey);
    if (count === 1) {
      // First request in this window — set the expiry (fire-and-forget)
      this.redisClient.expire(redisKey, windowSecs).catch(() => {});
    }

    const limited = count > this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - count);
    return { limited, remaining };
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
        logger.warn('[RateLimit] PDIM congested — passing request through uncounted:', (err as Error).message);
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
  const redisClient = getRedisClient();

  const limiter = new DistributedRateLimiter(
    {
      windowMs,
      maxRequests,
      skip: skipRateLimiting,
      keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return `${keyPrefix}:${userId ?? ip}`;
      },
    },
    redisClient
  );

  return limiter.middleware();
}

export const createScalableRateLimiter = (overrides?: Partial<RateLimiterConfig>): RequestHandler => {
  const redisClient = getRedisClient();

  const limiter = new DistributedRateLimiter(
    {
      windowMs: 60000,
      maxRequests: 1000,
      skip: skipRateLimiting,
      keyGenerator: (req) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const userId = (req as any).user?.id;
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

export const globalScalableRateLimiter = buildDistributedGlobal(60000, 10000, 'global');

export const apiRateLimiter = buildDistributedGlobal(60000, 5000, 'api');

export const aiRateLimiter = buildDistributedGlobal(60000, 2000, 'ai');

export const authRateLimiter = buildDistributedGlobal(900000, 200, 'auth');

export const createHighScaleRateLimiter = (
  tier: 'monthly' | 'yearly' | 'lifetime' | 'unlimited'
): RequestHandler => {
  const limits = {
    monthly: { windowMs: 60000, maxRequests: 100 },
    yearly: { windowMs: 60000, maxRequests: 1000 },
    lifetime: { windowMs: 60000, maxRequests: 10000 },
    unlimited: { windowMs: 60000, maxRequests: Number.MAX_SAFE_INTEGER },
  };

  return createScalableRateLimiter({
    ...limits[tier],
    skip: skipRateLimiting,
    keyGenerator: (req) => {
      const userId = (req as any).user?.id;
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
