import { RequestHandler, Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { isProductionEnv } from '../lib/envHelpers.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

const EXEMPT_PATH_PREFIXES = [
  '/api/webhooks/',
  '/api/stripe/webhook',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/demo',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify',
  '/api/auth/token/refresh',
  '/api/auth/google',
  '/api/errors',
  '/api/sendgrid/webhook',
  '/health',
  '/ready',
  '/status',
];

function getAllowedOrigins(req: Request): string[] {
  const host = req.headers.host || '';
  const proto =
    req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';

  const origins: string[] = [`${proto}://${host}`];

  const replSlug = process.env.REPL_SLUG;
  const replOwner = process.env.REPL_OWNER;
  if (replSlug && replOwner) {
    origins.push(`https://${replSlug}.${replOwner}.repl.co`);
    origins.push(`https://${replSlug}--${replOwner}.repl.co`);
    origins.push(`https://${replSlug}.replit.app`);
  }

  const appUrl = process.env.APP_URL || process.env.REPLIT_APP_URL;
  if (appUrl) {
    try {
      origins.push(new URL(appUrl).origin);
    } catch {
    }
  }

  return origins;
}

export const originValidation: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const isExempt = EXEMPT_PATH_PREFIXES.some((prefix) =>
    req.path.startsWith(prefix)
  );
  if (isExempt) return next();

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;

  if (!origin && !referer) {
    if (!isProductionEnv()) return next();
    logger.warn(`Mutation without Origin: ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return next();
  }

  let requestOrigin: string | null = null;
  if (origin) {
    requestOrigin = origin;
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      return next();
    }
  }

  if (!requestOrigin) return next();

  const allowed = getAllowedOrigins(req);
  if (!allowed.includes(requestOrigin)) {
    logger.warn(`Origin blocked: ${req.method} ${req.path}`, {
      requestOrigin,
      allowed,
      ip: req.ip,
    });
    return res.status(403).json({
      error: 'Origin not allowed',
      message: 'Request blocked: unexpected origin.',
    });
  }

  next();
};
