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
    // SECURITY: 2FA verification has strict limits to prevent brute-force attacks
    twoFactor: { windowMs: 300000, max: 5 }, // 5 attempts per 5 minutes
    captchaThreshold: 3
  },
  billing: {
    // SECURITY: Rate limits for billing endpoints
    perUser: { windowMs: 60000, max: 10 } // 10 requests per minute
  },
  uploads: {
    perUser: { windowMs: 3600000, max: 50 }
  }
};

const REDIS_KEY_PREFIX = 'ratelimit:';

interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
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
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs, total: 1 };
  }

  const redisKey = `${REDIS_KEY_PREFIX}${key}`;

  try {
    await redis.zRemRangeByScore(redisKey, '-inf', windowStart.toString());

    const requestCount = await redis.zCard(redisKey);

    if (requestCount >= maxRequests) {
      const oldestRequest = await redis.zRange(redisKey, 0, 0, { REV: false });
      let resetAt = now + windowMs;
      
      if (oldestRequest.length > 0) {
        const oldestTimestamp = parseInt(oldestRequest[0], 10);
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
    await redis.zAdd(redisKey, { score: now, value: requestId });

    await redis.expire(redisKey, Math.ceil(windowMs / 1000) + 60);

    return {
      allowed: true,
      remaining: maxRequests - requestCount - 1,
      resetAt: now + windowMs,
      total: requestCount + 1
    };
  } catch (error) {
    logger.error('Rate limiter Redis error:', error);
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs, total: 1 };
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
  // Skip ALL rate limiting in development mode - Replit proxy causes IP issues
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  
  const isMonitoring = req.path.startsWith('/api/monitoring/') || 
                       req.path.startsWith('/api/system/') ||
                       req.path.startsWith('/api/health');
  
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
  // Skip in development mode
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }
  
  const ip = getClientIP(req);
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
  // Skip in development mode
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
  // Skip in development mode
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

// SECURITY: 2FA verification rate limiter to prevent brute-force attacks
export const twoFactorRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip in development mode
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }
  
  const ip = getClientIP(req);
  const userId = getUserId(req);
  // Use both IP and userId for stricter limiting
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

// SECURITY: Billing endpoints rate limiter
export const billingRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip in development mode
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
  // Skip in development mode
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

    await redis.zRemRangeByScore(redisKey, '-inf', windowStart.toString());
    const count = await redis.zCard(redisKey);

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
