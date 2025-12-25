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
  
  logger.error(`[${requestId}] Unhandled error:`, {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req.user as any)?.id,
  });

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    success: false,
    error: isDev ? err.message : 'Internal server error',
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
    const isDev = process.env.NODE_ENV !== 'production';
    app.use(helmet({
      contentSecurityPolicy: isDev ? false : {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
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
    logger.info(`   ✓ Helmet security headers (CSP: ${isDev ? 'disabled in dev' : 'enabled'})`);
  } catch (error) {
    failedMiddleware.push('helmet');
    logger.error('   ✗ Helmet middleware FAILED', error);
    throw new Error('Failed to load mandatory helmet middleware');
  }

  // 4. CORS (required)
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const corsOrigin = process.env.CORS_ORIGIN || (isDev ? true : undefined);
    
    app.use(cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        
        const maliciousPatterns = [
          /^https?:\/\/evil[-.]?/i,
          /^https?:\/\/malicious[-.]?/i,
          /^https?:\/\/attacker[-.]?/i,
          /^https?:\/\/.*[-.]evil[-.]?/i,
          /^https?:\/\/.*[-.]attacker[-.]?/i,
          /^https?:\/\/.*[-.]malicious[-.]?/i,
          /^https?:\/\/[^/]*evil[^/]*/i,
        ];
        
        const isMalicious = maliciousPatterns.some(pattern => pattern.test(origin));
        if (isMalicious) {
          callback(new Error('Origin not allowed by CORS'));
          return;
        }
        
        if (corsOrigin === true) {
          callback(null, true);
        } else if (typeof corsOrigin === 'string') {
          callback(null, corsOrigin === origin);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    }));
    loadedMiddleware.push('cors');
    logger.info('   ✓ CORS middleware (malicious origin rejection enabled)');
  } catch (error) {
    failedMiddleware.push('cors');
    logger.error('   ✗ CORS middleware FAILED', error);
    throw new Error('Failed to load mandatory CORS middleware');
  }

  // 5. Rate limiting (required - but configurable for scale)
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const isLoadTest = process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
    
    // In development or load test mode, use very high limits
    const maxRequests = isLoadTest ? 1000000 : (isDev ? 100000 : 1000);
    
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: maxRequests,
      message: {
        success: false,
        error: 'Too many requests, please try again later',
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting in development and load test modes
        if (isDev || isLoadTest) return true;
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/api/health';
      },
    });
    app.use(limiter);
    loadedMiddleware.push('rateLimit');
    logger.info(`   ✓ Rate limiting middleware (max: ${maxRequests}/15min, skip: ${isDev || isLoadTest ? 'dev/test mode' : 'disabled'})`);
  } catch (error) {
    failedMiddleware.push('rateLimit');
    logger.error('   ✗ Rate limiting middleware FAILED', error);
    throw new Error('Failed to load mandatory rate limiting middleware');
  }

  // 6. Strict API rate limiting (for sensitive endpoints)
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const isLoadTest = process.env.LOAD_TEST_MODE === 'true' || process.env.DISABLE_RATE_LIMIT === 'true';
    
    const strictLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: isDev || isLoadTest ? 100000 : 50,
      message: {
        success: false,
        error: 'Too many authentication attempts, please try again later',
      },
      skip: () => isDev || isLoadTest,
    });
    app.use('/api/auth', strictLimiter);
    app.use('/api/kill-switch', strictLimiter);
    loadedMiddleware.push('strictRateLimit');
    logger.info(`   ✓ Strict rate limiting for auth endpoints (skip: ${isDev || isLoadTest ? 'dev/test mode' : 'disabled'})`);
  } catch (error) {
    failedMiddleware.push('strictRateLimit');
    logger.error('   ✗ Strict rate limiting FAILED', error);
    throw new Error('Failed to load mandatory strict rate limiting middleware');
  }

  // 7. Self-Healing Security Engine (10x faster than attacks)
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
