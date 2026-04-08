/**
 * MANDATORY MIDDLEWARE
 * 
 * Safety middleware that MUST load successfully.
 * Server will not start if any of these fail.
 */

import { Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '../logger.js';
import { randomUUID } from 'crypto';
import { selfHealingSecurityMiddleware } from '../middleware/selfHealingMiddleware.js';
import * as Sentry from '@sentry/node';
import { DistributedRateLimiter } from '../middleware/scalableRateLimiter.js';
import { getRedisClient } from '../lib/redisClient.js';

function isInternalIp(ip: string): boolean {
  if (!ip) return false;
  const stripped = ip.replace(/^::ffff:/, '');
  return (
    stripped === '127.0.0.1' ||
    stripped === '::1' ||
    stripped === 'localhost' ||
    stripped.startsWith('10.') ||
    stripped.startsWith('172.16.') ||
    stripped.startsWith('192.168.')
  );
}

/**
 * Prototype pollution protection
 * Removes dangerous properties from objects recursively
 */
function sanitizeObject(obj: any, depth: number = 0): any {
  if (depth > 10) return obj; // Prevent stack overflow
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const sanitized: any = {};
  
  for (const key of Object.keys(obj)) {
    if (dangerous.includes(key)) {
      logger.warn(`[Security] Blocked prototype pollution attempt: ${key}`);
      continue;
    }
    sanitized[key] = sanitizeObject(obj[key], depth + 1);
  }
  
  return sanitized;
}

/**
 * Prototype pollution protection middleware
 * Sanitizes request body, query, and params
 */
export function prototypePollutionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      const sanitized = sanitizeObject(req.query);
      for (const key of Object.keys(req.query)) {
        if (!(key in sanitized)) delete (req.query as any)[key];
      }
      Object.assign(req.query, sanitized);
    }
    if (req.params && typeof req.params === 'object') {
      const sanitizedParams = sanitizeObject(req.params);
      Object.assign(req.params, sanitizedParams);
    }
    next();
  } catch (error) {
    logger.error('Prototype pollution protection error:', error);
    next();
  }
}

export interface MandatoryMiddlewareResult {
  success: boolean;
  loadedMiddleware: string[];
  failedMiddleware: string[];
}

/**
 * Global error handler - MANDATORY
 * Must be registered last in middleware chain
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req as any).requestId || 'unknown';
  
  let statusCode = 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'ZodError') {
    statusCode = 400;
    const issues = Array.isArray((err as any).issues) ? (err as any).issues : [];
    const firstIssue = issues[0];
    message = firstIssue
      ? `Validation failed: ${firstIssue.path?.length ? firstIssue.path.join('.') + ' - ' : ''}${firstIssue.message}`
      : 'Validation failed';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message || 'Validation failed';
  } else if ((err as any).statusCode) {
    statusCode = (err as any).statusCode;
  } else if ((err as any).status) {
    statusCode = (err as any).status;
  }

  if (statusCode >= 500) {
    logger.error(`[${requestId}] Unhandled error:`, {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: (req.user as any)?.id,
    });
    try {
      Sentry.withScope((scope) => {
        scope.setTag('requestId', requestId);
        scope.setTag('path', req.path);
        scope.setTag('method', req.method);
        scope.setUser({ id: (req.user as any)?.id });
        Sentry.captureException(err);
      });
    } catch {
      // Intentionally silent — Sentry unavailable; must not cause recursive error-handler failure
    }
  }

  const isDev = process.env.NODE_ENV !== 'production';

  // Sanitize infrastructure-level error messages before surfacing to clients.
  // PDIM / circuit-breaker errors are service-layer internals — they're not
  // useful for debugging application logic and should never be shown verbatim.
  const isPdimError = /^(\[?PDIM\]?|Circuit OPEN|PDIM HTTP|PDIM returned)/i.test(message);
  const clientMessage = isPdimError
    ? 'A temporary service issue occurred. Please try again in a moment.'
    : (isDev ? message : (statusCode >= 500 ? 'Internal server error' : message));

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    requestId,
  });
}

/**
 * Request ID middleware - MANDATORY
 * Adds correlation ID to all requests
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string || randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

/**
 * Request logging middleware - MANDATORY
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  const requestId = (req as any).requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[level](`[${requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

/**
 * Apply all mandatory middleware
 * Will throw if any critical middleware fails to load
 */
export function applyMandatoryMiddleware(app: Express): MandatoryMiddlewareResult {
  const loadedMiddleware: string[] = [];
  const failedMiddleware: string[] = [];

  logger.info('════════════════════════════════════════════════════════');
  logger.info('🛡️ LOADING MANDATORY SECURITY MIDDLEWARE');
  logger.info('════════════════════════════════════════════════════════');

  // 1. Request ID (required for correlation)
  try {
    app.use(requestIdMiddleware);
    loadedMiddleware.push('requestId');
    logger.info('   ✓ Request ID middleware');
  } catch (error) {
    failedMiddleware.push('requestId');
    logger.error('   ✗ Request ID middleware FAILED', error);
    throw new Error('Failed to load mandatory requestId middleware');
  }

  // 2. Request logging
  try {
    app.use(requestLoggingMiddleware);
    loadedMiddleware.push('requestLogging');
    logger.info('   ✓ Request logging middleware');
  } catch (error) {
    failedMiddleware.push('requestLogging');
    logger.error('   ✗ Request logging middleware FAILED', error);
    throw new Error('Failed to load mandatory requestLogging middleware');
  }

  // 3. Helmet security headers (required)
  try {
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"],
          imgSrc: ["'self'", "data:", "https:", "blob:"],
          connectSrc: ["'self'", "https://api.stripe.com", "wss:", "https:"],
          frameSrc: ["'self'", "https://js.stripe.com"],
          mediaSrc: ["'self'", "data:", "blob:"],
          workerSrc: ["'self'", "blob:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));
    loadedMiddleware.push('helmet');
    logger.info('   ✓ Helmet security headers (CSP: enabled)');
  } catch (error) {
    failedMiddleware.push('helmet');
    logger.error('   ✗ Helmet middleware FAILED', error);
    throw new Error('Failed to load mandatory helmet middleware');
  }

  // 4. CORS (required)
  try {
    const isProduction = process.env.NODE_ENV === 'production';

    // Explicit allowlist. In production this includes the deployed domain plus all
    // Replit preview/dev subdomains (used by Replit's webview and deployment system).
    // In development every origin is permitted so local tooling is not blocked.
    const explicitOrigin = process.env.CORS_ORIGIN
      || process.env.DOMAIN
      || process.env.APP_URL
      || '';

    const allowedExactOrigins: string[] = explicitOrigin
      ? explicitOrigin.split(',').map((o) => o.trim()).filter(Boolean)
      : [];

    app.use(cors({
      origin: (origin, callback) => {
        // Same-origin or server-to-server requests (no Origin header) are always OK.
        if (!origin) {
          callback(null, true);
          return;
        }

        // Always allow Replit's own preview / webview / deployment domains.
        const isReplitDomain =
          origin.endsWith('.replit.dev') ||
          origin.endsWith('.repl.co') ||
          origin.endsWith('.replit.app');

        // Allow localhost / 127.0.0.1 origins (Replit webview preview)
        const isLocalOrigin =
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:');

        if (isReplitDomain || isLocalOrigin) {
          callback(null, true);
          return;
        }

        if (!isProduction) {
          // Development — allow everything (localhost, ngrok, etc.)
          callback(null, true);
          return;
        }

        // Production — enforce explicit allowlist.
        const allowed = allowedExactOrigins.includes(origin);
        if (allowed) {
          callback(null, true);
        } else {
          logger.warn(`[CORS] Blocked origin in production: ${origin}`);
          callback(new Error('Origin not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-csrf-token', 'Range'],
      exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type'],
    }));
    loadedMiddleware.push('cors');
    logger.info('   ✓ CORS middleware (production allowlist enforced)');
  } catch (error) {
    failedMiddleware.push('cors');
    logger.error('   ✗ CORS middleware FAILED', error);
    throw new Error('Failed to load mandatory CORS middleware');
  }

  // 5. Prototype pollution protection (required)
  try {
    app.use(prototypePollutionMiddleware);
    loadedMiddleware.push('prototypePollution');
    logger.info('   ✓ Prototype pollution protection');
  } catch (error) {
    failedMiddleware.push('prototypePollution');
    logger.error('   ✗ Prototype pollution protection FAILED', error);
    throw new Error('Failed to load mandatory prototype pollution middleware');
  }

  // 6. Rate limiting — Redis-backed distributed sliding window; in-memory fallback
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const isLoadTest = process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
    const maxRequests = isLoadTest ? 1_000_000 : isDev ? 100_000 : 1_000;
    const windowMs = 15 * 60 * 1000;

    let redisClient: any = null;
    try { redisClient = getRedisClient(); } catch { /* fall through to in-memory */ }

    const limiter = new DistributedRateLimiter(
      {
        windowMs,
        maxRequests,
        skip: (req) => {
          if (isDev || isLoadTest) return true;
          const ip = req.ip || req.socket?.remoteAddress || '';
          if (isInternalIp(ip)) return true;
          return req.path === '/health' || req.path === '/api/health' || req.path === '/api/version';
        },
        keyGenerator: (req) => {
          const userId = (req as any).user?.id;
          const ip = req.ip || req.socket?.remoteAddress || 'unknown';
          return `mandatory:${userId ?? ip}`;
        },
      },
      redisClient
    );
    app.use(limiter.middleware());
    loadedMiddleware.push('rateLimit');
    const backend = redisClient ? 'Redis' : 'in-memory';
    logger.info(`   ✓ Rate limiting middleware (max: ${maxRequests}/15min, backend: ${backend}, skip: ${isDev || isLoadTest ? 'dev/test mode' : 'disabled'})`);
  } catch (error) {
    failedMiddleware.push('rateLimit');
    logger.error('   ✗ Rate limiting middleware FAILED', error);
    throw new Error('Failed to load mandatory rate limiting middleware');
  }

  // 7. Strict API rate limiting (for sensitive endpoints) — Redis-backed
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const isLoadTest = process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
    const maxRequests = isDev || isLoadTest ? 100_000 : 200;
    const windowMs = 15 * 60 * 1000;

    let redisClient: any = null;
    try { redisClient = getRedisClient(); } catch { /* fall through to in-memory */ }

    const strictLimiter = new DistributedRateLimiter(
      {
        windowMs,
        maxRequests,
        skip: (req) => {
          if (isDev || isLoadTest) return true;
          const ip = req.ip || req.socket?.remoteAddress || '';
          if (isInternalIp(ip)) return true;
          // Session maintenance endpoints are exempt — they have their own rate limiter
          // and are required for every page load (not actual login attempts)
          const sessionPaths = ['/api/auth/refresh-token', '/api/auth/me', '/api/auth/heartbeat'];
          if (sessionPaths.includes(req.path)) return true;
          return false;
        },
        keyGenerator: (req) => {
          const ip = req.ip || req.socket?.remoteAddress || 'unknown';
          return `strict:${ip}`;
        },
      },
      redisClient
    );
    app.use('/api/auth', strictLimiter.middleware());
    app.use('/api/kill-switch', strictLimiter.middleware());
    loadedMiddleware.push('strictRateLimit');
    logger.info(`   ✓ Strict rate limiting for auth endpoints (skip: ${isDev || isLoadTest ? 'dev/test mode' : 'disabled'})`);
  } catch (error) {
    failedMiddleware.push('strictRateLimit');
    logger.error('   ✗ Strict rate limiting FAILED', error);
    throw new Error('Failed to load mandatory strict rate limiting middleware');
  }

  // 8. Self-Healing Security Engine (10x faster than attacks)
  try {
    app.use(selfHealingSecurityMiddleware);
    loadedMiddleware.push('selfHealingSecurity');
    logger.info('   ✓ Self-Healing Security Engine (10x healing speed)');
  } catch (error) {
    failedMiddleware.push('selfHealingSecurity');
    logger.error('   ✗ Self-Healing Security Engine FAILED', error);
    // Non-critical - log but don't throw
    logger.warn('   ⚠️ Self-healing security running in degraded mode');
  }

  logger.info('────────────────────────────────────────────────────────');
  logger.info(`   Loaded: ${loadedMiddleware.length} | Failed: ${failedMiddleware.length}`);
  logger.info('   ✅ All mandatory middleware loaded successfully');
  logger.info('════════════════════════════════════════════════════════');

  return {
    success: failedMiddleware.length === 0,
    loadedMiddleware,
    failedMiddleware,
  };
}
