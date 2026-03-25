import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

const APP_DOMAIN = process.env.APP_URL || 'https://maxbooster.replit.app';
const isDev = process.env.NODE_ENV !== 'production';

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://js.stripe.com',
        'https://www.googletagmanager.com',
        'https://connect.facebook.net',
        ...(isDev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'data:',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https:',
      ],
      mediaSrc: [
        "'self'",
        'blob:',
        'data:',
        'https:',
      ],
      connectSrc: [
        "'self'",
        APP_DOMAIN,
        'wss:',
        'ws:',
        'https://api.stripe.com',
        'https://api.labelgrid.com',
        'https://secure-ai-forge.replit.app',
        'https://pocketdimensionstorage.replit.app',
        'https://o4510378512613376.ingest.us.sentry.io',
        ...(isDev ? ['ws://localhost:*', 'http://localhost:*'] : []),
      ],
      frameSrc: [
        "'self'",
        'https://js.stripe.com',
        'https://hooks.stripe.com',
      ],
      workerSrc: [
        "'self'",
        'blob:',
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100_000 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || '';
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('192.168.')
    );
  },
  handler: (_req: Request, res: Response) => {
    logger.warn('[Security] Global rate limit exceeded');
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

export function securityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  helmetMiddleware(req, res, (helmetErr?: any) => {
    if (helmetErr) {
      logger.warn('[Security] Helmet error (non-fatal):', helmetErr?.message);
    }
    globalRateLimit(req, res, next);
  });
}
