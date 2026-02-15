/**
 * SELF-HEALING SECURITY MIDDLEWARE
 * 
 * Integrates the Self-Healing Security Engine with Express.
 * Monitors all requests in real-time for threat detection and automatic healing.
 */

import { Request, Response, NextFunction } from 'express';
import { selfHealingEngine } from '../services/selfHealingSecurityEngine.js';
import { logger } from '../logger.js';

const WHITELISTED_IPS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

const isDev = process.env.NODE_ENV !== 'production';

export function selfHealingSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  const ip = req.ip || 
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 
    req.socket.remoteAddress || 
    'unknown';

  const isWhitelisted = isDev && (WHITELISTED_IPS.has(ip) || ip.startsWith('::ffff:127.'));

  if (!isWhitelisted && selfHealingEngine.isIpBlocked(ip)) {
    res.status(403).json({
      error: 'Access denied',
      code: 'IP_BLOCKED',
      message: 'Your IP has been temporarily blocked due to suspicious activity',
    });
    return;
  }

  selfHealingEngine.processSecurityEvent({
    type: 'request',
    category: getRequestCategory(req.path),
    severity: 'low',
    source: {
      ip,
      userAgent: req.headers['user-agent'],
      userId: (req as any).user?.id,
      sessionId: req.sessionID,
    },
    payload: {
      path: req.path,
      method: req.method,
      body: sanitizeBody(req.body),
      headers: sanitizeHeaders(req.headers),
    },
    metrics: {
      latency: 0,
    },
  });

  res.on('finish', () => {
    const latency = Date.now() - startTime;

    if (res.statusCode >= 400) {
      selfHealingEngine.processSecurityEvent({
        type: 'request',
        category: 'error_response',
        severity: res.statusCode >= 500 ? 'high' : 'medium',
        source: {
          ip,
          userAgent: req.headers['user-agent'],
          userId: (req as any).user?.id,
          sessionId: req.sessionID,
        },
        payload: {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
        },
        metrics: {
          latency,
          errorCount: 1,
        },
      });
    }
  });

  next();
}

function getRequestCategory(path: string): string {
  if (path.startsWith('/api/auth')) return 'authentication';
  if (path.startsWith('/api/admin')) return 'admin';
  if (path.startsWith('/api/payouts') || path.startsWith('/api/webhooks/stripe')) return 'payment';
  if (path.startsWith('/api/distribution')) return 'distribution';
  if (path.startsWith('/api/developer')) return 'developer_api';
  if (path.startsWith('/api')) return 'api';
  return 'general';
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'cvv', 'ssn'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function sanitizeHeaders(headers: Record<string, any>): Record<string, string> {
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'stripe-signature'];
  const sanitized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function getSelfHealingStatus() {
  return selfHealingEngine.getStatus();
}

export function getSelfHealingMetrics() {
  return selfHealingEngine.getMetrics();
}
