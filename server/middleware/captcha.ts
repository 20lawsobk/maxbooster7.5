import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';
import { RATE_LIMITS } from './rateLimiter.js';

const CAPTCHA_KEY_PREFIX = 'captcha:attempts:';
const CAPTCHA_WINDOW_MS = 900000; // 15 minutes

interface CaptchaStatus {
  required: boolean;
  attempts: number;
  threshold: number;
}

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export async function getFailedAttempts(ip: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;

  try {
    const key = `${CAPTCHA_KEY_PREFIX}${ip}`;
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    logger.error('Error getting failed attempts:', error);
    return 0;
  }
}

export async function incrementFailedAttempts(ip: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;

  try {
    const key = `${CAPTCHA_KEY_PREFIX}${ip}`;
    const newCount = await redis.incr(key);
    
    const ttl = await redis.ttl(key);
    if (ttl < 0) {
      await redis.expire(key, Math.ceil(CAPTCHA_WINDOW_MS / 1000));
    }
    
    return newCount;
  } catch (error) {
    logger.error('Error incrementing failed attempts:', error);
    return 0;
  }
}

export async function resetFailedAttempts(ip: string): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;

  try {
    const key = `${CAPTCHA_KEY_PREFIX}${ip}`;
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Error resetting failed attempts:', error);
    return false;
  }
}

export async function getCaptchaStatus(ip: string): Promise<CaptchaStatus> {
  const attempts = await getFailedAttempts(ip);
  const threshold = RATE_LIMITS.auth.captchaThreshold;
  
  return {
    required: attempts >= threshold,
    attempts,
    threshold
  };
}

async function verifyCaptchaToken(token: string, secret: string): Promise<boolean> {
  if (!secret || !token) {
    logger.warn('Captcha verification skipped - no secret configured');
    return true;
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret,
        response: token,
      }),
    });

    const data = await response.json() as { success: boolean; score?: number };
    
    if (data.success && (data.score === undefined || data.score >= 0.5)) {
      return true;
    }
    
    logger.warn('Captcha verification failed:', { success: data.success, score: data.score });
    return false;
  } catch (error) {
    logger.error('Captcha verification error:', error);
    return false;
  }
}

async function verifyHCaptchaToken(token: string, secret: string): Promise<boolean> {
  if (!secret || !token) {
    logger.warn('hCaptcha verification skipped - no secret configured');
    return true;
  }

  try {
    const response = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret,
        response: token,
      }),
    });

    const data = await response.json() as { success: boolean };
    return data.success;
  } catch (error) {
    logger.error('hCaptcha verification error:', error);
    return false;
  }
}

export const captchaMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const ip = getClientIP(req);
  const status = await getCaptchaStatus(ip);

  if (!status.required) {
    next();
    return;
  }

  const captchaToken = req.body?.captchaToken || req.headers['x-captcha-token'];

  if (!captchaToken) {
    res.status(403).json({
      error: 'Captcha Required',
      message: 'Too many failed attempts. Please complete the captcha verification.',
      captchaRequired: true,
      attempts: status.attempts,
      threshold: status.threshold
    });
    return;
  }

  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY;

  let isValid = false;

  if (recaptchaSecret) {
    isValid = await verifyCaptchaToken(captchaToken as string, recaptchaSecret);
  } else if (hcaptchaSecret) {
    isValid = await verifyHCaptchaToken(captchaToken as string, hcaptchaSecret);
  } else {
    logger.warn('No captcha secret configured - allowing request');
    isValid = true;
  }

  if (!isValid) {
    res.status(403).json({
      error: 'Captcha Verification Failed',
      message: 'The captcha verification failed. Please try again.',
      captchaRequired: true
    });
    return;
  }

  next();
};

export async function trackLoginAttempt(
  ip: string,
  success: boolean
): Promise<{ captchaRequired: boolean; attempts: number }> {
  if (success) {
    await resetFailedAttempts(ip);
    return { captchaRequired: false, attempts: 0 };
  }

  const attempts = await incrementFailedAttempts(ip);
  const threshold = RATE_LIMITS.auth.captchaThreshold;
  
  return {
    captchaRequired: attempts >= threshold,
    attempts
  };
}

export function createCaptchaCheckMiddleware(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIP(req);
    const status = await getCaptchaStatus(ip);
    
    (req as any).captchaStatus = status;
    next();
  };
}

export async function isCaptchaRequired(ip: string): Promise<boolean> {
  const status = await getCaptchaStatus(ip);
  return status.required;
}
