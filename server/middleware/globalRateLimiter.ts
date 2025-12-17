import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';

// Aggressive rate limiting for extreme load protection
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the request limit. Please slow down and try again later.',
    retryAfter: `${Math.ceil(config.rateLimiting.windowMs / 1000)} seconds`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isMonitoringEndpoint = req.path.startsWith('/api/monitoring/') || req.path.startsWith('/api/system/');
    const isStaticAsset =
      req.path.startsWith('/@fs/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/@vite/') ||
      req.path.startsWith('/@react-refresh') ||
      req.path.startsWith('/@replit/');
    
    // Always skip monitoring/system endpoints (needed for health checks and burn-in tests)
    if (isMonitoringEndpoint) {
      return true;
    }
    
    // Skip ALL requests in development mode (rate limiting is for production only)
    // In development, traffic comes through Replit's proxy with varying IPs
    if (isDevelopment) {
      return true;
    }
    
    // Skip static assets in all environments
    return isStaticAsset;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`⚠️ Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the request limit. Please slow down and try again later.',
      retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000),
    });
  },
});

// Critical endpoints get stricter limits
export const criticalEndpointLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.criticalMax,
  message: {
    error: 'Too many requests to critical endpoint',
    message: 'This endpoint is rate-limited. Please try again later.',
  },
});
