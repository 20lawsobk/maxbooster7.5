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

interface SlidingWindowEntry {
  count: number;
  resetTime: number;
  tokens: number[];
}

class ScalableRateLimiter {
  private store: Map<string, SlidingWindowEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.resetTime < now) {
          this.store.delete(key);
        }
      }
    }, 60000);
  }

  isRateLimited(key: string): { limited: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let entry = this.store.get(key);
    
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        tokens: [],
      };
      this.store.set(key, entry);
    }

    entry.tokens = entry.tokens.filter(t => t > windowStart);
    
    const currentCount = entry.tokens.length;
    const remaining = Math.max(0, this.config.maxRequests - currentCount);
    
    if (currentCount >= this.config.maxRequests) {
      return { limited: true, remaining: 0, resetTime: entry.resetTime };
    }

    entry.tokens.push(now);
    entry.count = entry.tokens.length;
    
    return { limited: false, remaining: remaining - 1, resetTime: entry.resetTime };
  }

  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (this.config.skip?.(req)) {
        next();
        return;
      }

      const key = this.config.keyGenerator?.(req) || req.ip || 'unknown';
      const result = this.isRateLimited(key);

      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

      if (result.limited) {
        if (this.config.onRateLimit) {
          this.config.onRateLimit(req, res);
        } else {
          res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please slow down.',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
          });
        }
        return;
      }

      next();
    };
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

const isDevelopmentMode = (): boolean => {
  return process.env.NODE_ENV !== 'production' && !process.env.REPLIT_DEPLOYMENT;
};

const isLoadTestMode = (): boolean => {
  return process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
};

const skipRateLimiting = (req: Request): boolean => {
  if (isDevelopmentMode()) return true;
  if (isLoadTestMode()) return true;
  
  const path = req.path;
  
  if (path.startsWith('/api/health')) return true;
  if (path === '/api/version') return true;
  if (path.startsWith('/api/monitoring')) return true;
  if (path.startsWith('/api/system')) return true;
  
  if (path.startsWith('/@fs/')) return true;
  if (path.startsWith('/src/')) return true;
  if (path.startsWith('/node_modules/')) return true;
  if (path.startsWith('/@vite/')) return true;
  if (path.startsWith('/@react-refresh')) return true;
  if (path.startsWith('/@replit/')) return true;
  
  return false;
};

export const createScalableRateLimiter = (overrides?: Partial<RateLimiterConfig>): RequestHandler => {
  const limiter = new ScalableRateLimiter({
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
  });

  return limiter.middleware();
};

// Build a Redis-backed distributed global limiter; fall back to in-memory if Redis unavailable
function buildDistributedGlobal(
  windowMs: number,
  maxRequests: number,
  keyPrefix = 'global'
): RequestHandler {
  let redisClient: any = null;
  try {
    redisClient = getRedisClient();
  } catch {
    logger.warn('[RateLimit] Redis unavailable — global rate limiter using in-memory fallback');
  }

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

export class DistributedRateLimiter {
  private localStore: Map<string, SlidingWindowEntry> = new Map();
  private config: RateLimiterConfig;
  private redisClient: any = null;

  constructor(config: RateLimiterConfig, redisClient?: any) {
    this.config = config;
    this.redisClient = redisClient;
  }

  // Single atomic Lua script — replaces the previous 4-round-trip approach
  // (ZREMRANGEBYSCORE → ZCARD → ZADD → PEXPIRE).  Executing all four
  // operations in one EVAL call eliminates the race condition where two
  // concurrent requests both pass the ZCARD check before either ZADD lands.
  private static readonly SLIDING_WINDOW_LUA = `
    local key        = KEYS[1]
    local now        = tonumber(ARGV[1])
    local window_ms  = tonumber(ARGV[2])
    local max_req    = tonumber(ARGV[3])
    local window_start = now - window_ms

    redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
    local count = tonumber(redis.call('ZCARD', key))

    if count >= max_req then
      return {1, 0}
    end

    redis.call('ZADD', key, now, now .. ':' .. math.random())
    redis.call('PEXPIRE', key, window_ms)

    return {0, max_req - count - 1}
  `;

  async isRateLimited(key: string): Promise<{ limited: boolean; remaining: number }> {
    if (this.redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        const now = Date.now();

        const result = await this.redisClient.eval(
          DistributedRateLimiter.SLIDING_WINDOW_LUA,
          1,
          redisKey,
          String(now),
          String(this.config.windowMs),
          String(this.config.maxRequests)
        ) as [number, number];

        return {
          limited: result[0] === 1,
          remaining: Math.max(0, result[1] ?? 0),
        };
      } catch (error) {
        logger.warn('Redis rate limit Lua eval failed, falling back to local');
      }
    }

    return this.localRateLimit(key);
  }

  private localRateLimit(key: string): { limited: boolean; remaining: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let entry = this.localStore.get(key);
    
    if (!entry) {
      entry = { count: 0, resetTime: now + this.config.windowMs, tokens: [] };
      this.localStore.set(key, entry);
    }

    entry.tokens = entry.tokens.filter(t => t > windowStart);
    
    if (entry.tokens.length >= this.config.maxRequests) {
      return { limited: true, remaining: 0 };
    }

    entry.tokens.push(now);
    return { limited: false, remaining: this.config.maxRequests - entry.tokens.length };
  }

  middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (this.config.skip?.(req)) {
        next();
        return;
      }

      const key = this.config.keyGenerator?.(req) || req.ip || 'unknown';
      const result = await this.isRateLimited(key);

      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (result.limited) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(this.config.windowMs / 1000),
        });
        return;
      }

      next();
    };
  }
}

export const globalScalableRateLimiter = buildDistributedGlobal(60000, 10000, 'global');

export const apiRateLimiter = buildDistributedGlobal(60000, 5000, 'api');

export const aiRateLimiter = buildDistributedGlobal(60000, 2000, 'ai');

export const authRateLimiter = buildDistributedGlobal(900000, 100, 'auth');

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
