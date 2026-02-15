import { randomBytes, timingSafeEqual } from 'crypto';
import { RequestHandler, Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export const CSRF_COOKIE = 'csrf-token';
export const CSRF_HEADER = 'x-csrf-token';

const isProduction = process.env.NODE_ENV === 'production';

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export const csrfProtection: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = (req.headers[CSRF_HEADER] as string) || req.body?._csrf;

  if (!cookieToken) {
    logger.warn(`CSRF validation failed: Missing CSRF cookie - ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(403).json({ 
      error: 'CSRF validation failed',
      message: 'Missing security token. Please refresh the page and try again.'
    });
  }

  if (!headerToken) {
    logger.warn(`CSRF validation failed: Missing CSRF header/body token - ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(403).json({ 
      error: 'CSRF validation failed',
      message: 'Missing security token in request. Please refresh the page and try again.'
    });
  }

  if (!safeCompare(cookieToken, headerToken)) {
    logger.warn(`CSRF validation failed: Token mismatch - ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(403).json({ 
      error: 'CSRF validation failed',
      message: 'Invalid security token. Please refresh the page and try again.'
    });
  }

  next();
};

export const generateCsrfToken: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    
    (req as any).csrfToken = token;
  } else {
    (req as any).csrfToken = req.cookies[CSRF_COOKIE];
  }
  
  next();
};

export const getCsrfToken: RequestHandler = (req: Request, res: Response) => {
  let token = req.cookies?.[CSRF_COOKIE];
  
  if (!token) {
    token = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  
  res.json({ csrfToken: token });
};

export const refreshCsrfToken: RequestHandler = (req: Request, res: Response) => {
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
  
  res.json({ csrfToken: token });
};

const CSRF_EXEMPT_PATHS = [
  '/api/webhooks/',
  '/api/stripe/webhook',
  '/api/auth/token/refresh',
  '/health',
  '/ready',
];

export const csrfProtectionWithExemptions: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const isExempt = CSRF_EXEMPT_PATHS.some(path => req.path.startsWith(path));
  
  if (isExempt) {
    return next();
  }
  
  return csrfProtection(req, res, next);
};
