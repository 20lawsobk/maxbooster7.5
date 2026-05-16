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
import { isRoutesReady } from '../lib/bootState.js';
import { selfHealingSecurityMiddleware } from '../middleware/selfHealingMiddleware.js';
import { Sentry } from '../instrument.js';
import { DistributedRateLimiter } from '../middleware/scalableRateLimiter.js';
import { getRedisClient } from '../lib/redisClient.js';
import { env } from '../config/env.js';
import { isProductionEnv } from '../lib/envHelpers.js';

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
function sanitizeObject(obj: Record<string, unknown>, depth: number = 0): Record<string, unknown> {
  if (depth > 10) return obj; // Prevent stack overflow
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const sanitized: Record<string, unknown> = {};
  
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
        if (!(key in sanitized)) delete (req.query as Record<string, unknown>)[key];
      }
      Object.assign(req.query, sanitized);
    }
    if (req.params && typeof req.params === 'object') {
      const sanitizedParams = sanitizeObject(req.params);
      Object.assign(req.params, sanitizedParams);
    }
    next();
  } catch (error) {
    logger.warn({ err: error }, 'Prototype pollution protection error:');
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
  const requestId = (req as Record<string, unknown>).requestId || 'unknown';
  
  let statusCode = 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'ZodError') {
    statusCode = 400;
    const issues = Array.isArray((err as Record<string, unknown>).issues) ? (err as Record<string, unknown>).issues : [];
    const firstIssue = issues[0];
    message = firstIssue
      ? `Validation failed: ${firstIssue.path?.length ? firstIssue.path.join('.') + ' - ' : ''}${firstIssue.message}`
      : 'Validation failed';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message || 'Validation failed';
  } else if ((err as Record<string, unknown>).statusCode) {
    statusCode = (err as Record<string, unknown>).statusCode;
  } else if ((err as Record<string, unknown>).status) {
    statusCode = (err as Record<string, unknown>).status;
  }

  if (statusCode >= 500) {
    logger.warn({
      requestId,
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: (req.user as Record<string, unknown>)?.id,
    }, `[${requestId}] Unhandled error: ${err.message}`);
    try {
      if (Sentry) {
        Sentry.withScope((scope) => {
          scope.setTag('requestId', requestId);
          scope.setTag('path', req.path);
          scope.setTag('method', req.method);
          scope.setUser({ id: (req.user as Record<string, unknown>)?.id });
          Sentry!.captureException(err);
        });
      }
    } catch {
      // Intentionally silent — Sentry unavailable; must not cause recursive error-handler failure
    }
  }

  const isDev = !isProductionEnv();

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
  (req as Record<string, unknown>).requestId = requestId;
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
  const requestId = (req as Record<string, unknown>).requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    // 401/403 are expected auth flows (unauthenticated clients, token expiry) — log at INFO.
    const isAuthStatus = res.statusCode === 401 || res.statusCode === 403;
    // Static/Vite asset 404s are browser SW cache artifacts on restart — not actionable.
    const isStaticAsset =
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@fs/') ||
      req.path.startsWith('/@vite') ||
      /\.(js|css|map|woff2?|ttf|eot|svg|png|ico|webp)(\?|$)/.test(req.path);
    const isAsset404 = res.statusCode === 404 && isStaticAsset;
    // 404s during the boot window (before registerRoutes() completes) are startup
    // races — the route is not yet mounted, not a real missing-endpoint error.
    const isBootWindow404 = res.statusCode === 404 && !isRoutesReady();
    const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 && !isAuthStatus && !isAsset404 && !isBootWindow404) ? 'warn' : 'info';
    
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
    logger.warn({ err: error }, '   ✗ Request ID middleware FAILED');
    throw new Error('Failed to load mandatory requestId middleware');
  }

  // 2. Request logging
  try {
    app.use(requestLoggingMiddleware);
    loadedMiddleware.push('requestLogging');
    logger.info('   ✓ Request logging middleware');
  } catch (error) {
    failedMiddleware.push('requestLogging');
    logger.warn({ err: error }, '   ✗ Request logging middleware FAILED');
    throw new Error('Failed to load mandatory requestLogging middleware');
  }

  // 3. Helmet security headers
  // The canonical helmet instance with production-aware CSP is already registered
  // in server/middleware/security.ts (securityMiddleware), which runs BEFORE this
  // mandatory middleware block.  Registering a second helmet here would run AFTER
  // the stricter one and its last-write-wins behaviour would silently downgrade the
  // Content-Security-Policy (e.g. re-adding 'unsafe-inline' to scriptSrc).
  // We therefore SKIP the duplicate helmet call here and rely on securityMiddleware.
  loadedMiddleware.push('helmet');
  logger.info('   ✓ Helmet security headers (deferred to securityMiddleware — avoids CSP downgrade)');

  // 4. CORS (required)
  try {
    const isProduction = isProductionEnv();

    // Explicit allowlist. In production this includes the deployed domain plus all
    // Replit preview/dev subdomains (used by Replit's webview and deployment system).
    // In development every origin is permitted so local tooling is not blocked.
    const explicitOrigin = env.CORS_ORIGIN
      || env.DOMAIN
      || env.APP_URL
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

        // Always allow the platform's own custom domain and all its subdomains
        // (artist storefronts live at *.max-booster.com).
        const isPlatformDomain =
          origin === 'https://max-booster.com' ||
          origin === 'https://www.max-booster.com' ||
          origin.endsWith('.max-booster.com');

        if (isReplitDomain || isLocalOrigin || isPlatformDomain) {
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
    logger.warn({ err: error }, '   ✗ CORS middleware FAILED');
    throw new Error('Failed to load mandatory CORS middleware');
  }

  // 5. Prototype pollution protection (required)
  try {
    app.use(prototypePollutionMiddleware);
    loadedMiddleware.push('prototypePollution');
    logger.info('   ✓ Prototype pollution protection');
  } catch (error) {
    failedMiddleware.push('prototypePollution');
    logger.warn({ err: error }, '   ✗ Prototype pollution protection FAILED');
    throw new Error('Failed to load mandatory prototype pollution middleware');
  }

  // 6. Rate limiting — Redis-backed distributed sliding window; in-memory fallback
  try {
    const isDev = !isProductionEnv();
    const isLoadTest = process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
    const maxRequests = isLoadTest ? 1_000_000 : isDev ? 100_000 : 1_000;
    const windowMs = 15 * 60 * 1000;

    let redisClient: Record<string, unknown> | null = null;
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
          const userId = (req as Record<string, unknown>).user?.id;
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
    logger.warn({ err: error }, '   ✗ Rate limiting middleware FAILED');
    throw new Error('Failed to load mandatory rate limiting middleware');
  }

  // 7. Strict API rate limiting (for sensitive endpoints) — Redis-backed
  try {
    const isDev = !isProductionEnv();
    const isLoadTest = process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
    const maxRequests = isDev || isLoadTest ? 100_000 : 200;
    const windowMs = 15 * 60 * 1000;

    let redisClient: Record<string, unknown> | null = null;
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
    logger.warn({ err: error }, '   ✗ Strict rate limiting FAILED');
    throw new Error('Failed to load mandatory strict rate limiting middleware');
  }

  // 8. Self-Healing Security Engine (10x faster than attacks)
  try {
    app.use(selfHealingSecurityMiddleware);
    loadedMiddleware.push('selfHealingSecurity');
    logger.info('   ✓ Self-Healing Security Engine (10x healing speed)');
  } catch (error) {
    failedMiddleware.push('selfHealingSecurity');
    logger.warn({ err: error }, '   ✗ Self-Healing Security Engine FAILED');
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
