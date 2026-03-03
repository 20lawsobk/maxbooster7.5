import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';

export const RATE_LIMITS = {
  global: {
    perIP: { windowMs: 60000, max: 100 },
    perUser: { windowMs: 60000, max: 200 }
  },
  auth: {
    login: { windowMs: 900000, max: 5 },
    register: { windowMs: 3600000, max: 3 },
    forgotPassword: { windowMs: 3600000, max: 3 },
    twoFactor: { windowMs: 300000, max: 5 },
    captchaThreshold: 3
  },
  billing: {
    perUser: { windowMs: 60000, max: 10 }
  },
  uploads: {
    perUser: { windowMs: 3600000, max: 50 }
  },
  ai: {
    perUser: { windowMs: 3600000, max: 100 }
  }
};

const REDIS_KEY_PREFIX = 'ratelimit:';

interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}

const DEGRADED_RATE_FRACTION = 0.25;
const DEGRADED_MAX_KEYS = 10_000;

class InMemoryDegradedRateLimiter {
  private store = new Map<string, number[]>();
  private lastPrune = Date.now();

  check(key: string, windowMs: number, maxRequests: number): SlidingWindowResult {
    const now = Date.now();
    const degradedMax = Math.max(1, Math.floor(maxRequests * DEGRADED_RATE_FRACTION));

    if (now - this.lastPrune > 60_000) {
      this.prune(now);
    }

    if (!this.store.has(key) && this.store.size >= DEGRADED_MAX_KEYS) {
      return { allowed: false, remaining: 0, resetAt: now + windowMs, total: degradedMax };
    }

    const windowStart = now - windowMs;
    const timestamps = (this.store.get(key) || []).filter(t => t > windowStart);

    if (timestamps.length >= degradedMax) {
      this.store.set(key, timestamps);
      return { allowed: false, remaining: 0, resetAt: timestamps[0] + windowMs, total: timestamps.length };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);
    return { allowed: true, remaining: degradedMax - timestamps.length, resetAt: now + windowMs, total: timestamps.length };
  }

  private prune(now: number): void {
    const cutoff = now - 3_600_000;
    for (const [key, timestamps] of this.store) {
      const fresh = timestamps.filter(t => t > cutoff);
      if (fresh.length === 0) this.store.delete(key);
      else this.store.set(key, fresh);
    }
    this.lastPrune = now;
  }
}

const degradedLimiter = new InMemoryDegradedRateLimiter();

function getClientIP(req: Request): string {
  // Prefer the validated real client IP set by cloudflareMiddleware (uses CF-Connecting-IP
  // only when the socket originates from a verified Cloudflare IP range, preventing spoofing).
  // Fall back to req.ip which respects Express trust proxy configuration.
  return (req as any).realClientIp || req.ip || req.socket.remoteAddress || 'unknown';
}

function getUserId(req: Request): string | null {
  const user = req.user as any;
  return user?.id || null;
}

async function slidingWindowCheck(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<SlidingWindowResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redis = await getRedisClient();

  if (!redis) {
    logger.warn('[RateLimit] Redis unavailable — degraded mode (25% limits)');
    return degradedLimiter.check(key, windowMs, maxRequests);
  }

  const redisKey = `${REDIS_KEY_PREFIX}${key}`;

  try {
    // ioredis API: all commands are lowercase
    await redis.zremrangebyscore(redisKey, '-inf', windowStart);

    const requestCount: number = await redis.zcard(redisKey);

    if (requestCount >= maxRequests) {
      const oldest: string[] = await redis.zrange(redisKey, 0, 0);
      let resetAt = now + windowMs;

      if (oldest.length > 0) {
        const oldestTimestamp = parseInt(oldest[0], 10);
        resetAt = oldestTimestamp + windowMs;
      }

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        total: requestCount
      };
    }

    const requestId = `${now}:${Math.random().toString(36).substring(7)}`;
    // ioredis zadd: zadd(key, score, member)
    await redis.zadd(redisKey, now, requestId);

    await redis.expire(redisKey, Math.ceil(windowMs / 1000) + 60);

    return {
      allowed: true,
      remaining: maxRequests - requestCount - 1,
      resetAt: now + windowMs,
      total: requestCount + 1
    };
  } catch (error) {
    logger.error('[RateLimit] Redis error — degraded mode (25% limits):', error);
    return degradedLimiter.check(key, windowMs, maxRequests);
  }
}

function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
}

function sendRateLimitExceeded(res: Response, resetAt: number): void {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  res.setHeader('Retry-After', Math.max(1, retryAfter).toString());
  res.status(429).json({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.max(1, retryAfter)
  });
}

function shouldSkipRateLimiting(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const isMonitoring = req.path.startsWith('/api/monitoring/') ||
                       req.path.startsWith('/api/system/') ||
                       req.path.startsWith('/api/health') ||
                       req.path === '/api/version';

  const isStaticAsset = req.path.startsWith('/@fs/') ||
                        req.path.startsWith('/src/') ||
                        req.path.startsWith('/node_modules/');

  return isMonitoring || isStaticAsset;
}

export const globalIPRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (shouldSkipRateLimiting(req)) {
    next();
    return;
  }

  const ip = getClientIP(req);
  const key = `global:ip:${ip}`;
  const { perIP } = RATE_LIMITS.global;

  const result = await slidingWindowCheck(key, perIP.windowMs, perIP.max);
  setRateLimitHeaders(res, perIP.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const globalUserRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (shouldSkipRateLimiting(req)) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `global:user:${userId}`;
  const { perUser } = RATE_LIMITS.global;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const loginRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ip = getClientIP(req);

  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip?.startsWith('10.82.') || ip?.startsWith('10.')) {
    next();
    return;
  }
  const key = `auth:login:${ip}`;
  const { login } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(key, login.windowMs, login.max);
  setRateLimitHeaders(res, login.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Login rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const registerRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ip = getClientIP(req);
  const key = `auth:register:${ip}`;
  const { register } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(key, register.windowMs, register.max);
  setRateLimitHeaders(res, register.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Registration rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const forgotPasswordRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ip = getClientIP(req);
  const key = `auth:forgot-password:${ip}`;
  const { forgotPassword } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(key, forgotPassword.windowMs, forgotPassword.max);
  setRateLimitHeaders(res, forgotPassword.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Forgot password rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const twoFactorRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ip = getClientIP(req);
  const userId = getUserId(req);
  const key = userId ? `auth:2fa:${userId}:${ip}` : `auth:2fa:${ip}`;
  const { twoFactor } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(key, twoFactor.windowMs, twoFactor.max);
  setRateLimitHeaders(res, twoFactor.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`2FA rate limit exceeded for ${userId ? `user ${userId}` : `IP ${ip}`}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const billingRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `billing:user:${userId}`;
  const { perUser } = RATE_LIMITS.billing;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Billing rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const uploadRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `uploads:user:${userId}`;
  const { perUser } = RATE_LIMITS.uploads;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Upload rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const aiRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `ai:user:${userId}`;
  const { perUser } = RATE_LIMITS.ai;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`AI rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export async function getRateLimitStatus(
  type: 'ip' | 'user' | 'login' | 'register' | 'forgot-password' | 'upload',
  identifier: string
): Promise<{ remaining: number; resetAt: number; total: number } | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  let key: string;
  let config: { windowMs: number; max: number };

  switch (type) {
    case 'ip':
      key = `global:ip:${identifier}`;
      config = RATE_LIMITS.global.perIP;
      break;
    case 'user':
      key = `global:user:${identifier}`;
      config = RATE_LIMITS.global.perUser;
      break;
    case 'login':
      key = `auth:login:${identifier}`;
      config = RATE_LIMITS.auth.login;
      break;
    case 'register':
      key = `auth:register:${identifier}`;
      config = RATE_LIMITS.auth.register;
      break;
    case 'forgot-password':
      key = `auth:forgot-password:${identifier}`;
      config = RATE_LIMITS.auth.forgotPassword;
      break;
    case 'upload':
      key = `uploads:user:${identifier}`;
      config = RATE_LIMITS.uploads.perUser;
      break;
    default:
      return null;
  }

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;

    await redis.zremrangebyscore(redisKey, '-inf', windowStart);
    const count: number = await redis.zcard(redisKey);

    return {
      remaining: Math.max(0, config.max - count),
      resetAt: now + config.windowMs,
      total: count
    };
  } catch (error) {
    logger.error('Error getting rate limit status:', error);
    return null;
  }
}

export async function resetRateLimit(
  type: 'ip' | 'user' | 'login' | 'register' | 'forgot-password' | 'upload',
  identifier: string
): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;

  let key: string;

  switch (type) {
    case 'ip':
      key = `global:ip:${identifier}`;
      break;
    case 'user':
      key = `global:user:${identifier}`;
      break;
    case 'login':
      key = `auth:login:${identifier}`;
      break;
    case 'register':
      key = `auth:register:${identifier}`;
      break;
    case 'forgot-password':
      key = `auth:forgot-password:${identifier}`;
      break;
    case 'upload':
      key = `uploads:user:${identifier}`;
      break;
    default:
      return false;
  }

  try {
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;
    await redis.del(redisKey);
    return true;
  } catch (error) {
    logger.error('Error resetting rate limit:', error);
    return false;
  }
}
