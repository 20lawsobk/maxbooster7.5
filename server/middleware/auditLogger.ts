import { Request, Response, NextFunction } from 'express';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from '../db.js';
import { auditLogs } from '@shared/schema';
import { logger } from '../logger.js';

interface AuditEvent {
  timestamp: string;
  userId?: string;
  userEmail?: string;
  ip: string;
  userAgent: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  result: 'success' | 'failure' | 'error';
  risk: 'low' | 'medium' | 'high' | 'critical';
  sessionId?: string;
}

class AuditLogger {
  private logStream: NodeJS.WritableStream;
  private securityStream: NodeJS.WritableStream;

  constructor() {
    // Ensure log directory exists
    const logDir = join(process.cwd(), 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Create audit log streams
    this.logStream = createWriteStream(join(logDir, 'audit.log'), { flags: 'a' });
    this.securityStream = createWriteStream(join(logDir, 'security.log'), { flags: 'a' });
  }

  public log(event: AuditEvent) {
    const logEntry =
      JSON.stringify({
        ...event,
        timestamp: new Date().toISOString(),
      }) + '\n';

    this.logStream.write(logEntry);

    // Log high-risk events to security log as well
    if (event.risk === 'high' || event.risk === 'critical') {
      this.securityStream.write(logEntry);
    }

    // Mirror to Postgres `audit_logs` table — fire-and-forget so the request
    // path is never blocked by DB latency. File sink is the source of truth
    // for append-only durability; DB sink powers compliance dashboards and
    // queryable retention. A single try/catch guards both the .insert call
    // and any unhandled rejection from the underlying driver.
    try {
      void db
        .insert(auditLogs)
        .values({
          userId: event.userId ?? null,
          userEmail: event.userEmail ?? null,
          ip: event.ip || 'unknown',
          userAgent: event.userAgent || null,
          action: event.action,
          resource: event.resource,
          result: event.result,
          risk: event.risk,
          sessionId: event.sessionId ?? null,
          details: (event.details ?? null) as Record<string, unknown>,
        })
        .catch((err) => {
          // Never let an audit DB write crash the request — file sink already wrote.
          logger.warn({ err, action: event.action }, '[audit] postgres mirror failed');
        });
    } catch (err) {
      logger.warn({ err, action: event.action }, '[audit] postgres mirror threw synchronously');
    }
  }

  // Authentication events
  logLogin(req: Request, userId: string, userEmail: string, success: boolean) {
    this.log({
      timestamp: new Date().toISOString(),
      userId: success ? userId : undefined,
      userEmail: success ? userEmail : undefined,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'LOGIN',
      resource: 'auth',
      details: {
        method: 'local',
        success,
        attemptedEmail: userEmail,
      },
      result: success ? 'success' : 'failure',
      risk: success ? 'low' : 'medium',
      sessionId: req.sessionID,
    });
  }

  logLogout(req: Request, userId: string, userEmail: string) {
    this.log({
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'LOGOUT',
      resource: 'auth',
      details: {},
      result: 'success',
      risk: 'low',
      sessionId: req.sessionID,
    });
  }

  logRegistration(req: Request, userId: string, userEmail: string, success: boolean) {
    this.log({
      timestamp: new Date().toISOString(),
      userId: success ? userId : undefined,
      userEmail: success ? userEmail : undefined,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'REGISTER',
      resource: 'auth',
      details: {
        success,
        hasPayment: true, // Max Booster requires payment before account
      },
      result: success ? 'success' : 'failure',
      risk: 'medium',
      sessionId: req.sessionID,
    });
  }

  // Payment events
  logPayment(
    req: Request,
    userId: string,
    userEmail: string,
    amount: number,
    success: boolean,
    stripeSessionId?: string
  ) {
    this.log({
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'PAYMENT',
      resource: 'stripe',
      details: {
        amount,
        currency: 'USD',
        success,
        stripeSessionId,
        type: 'subscription',
      },
      result: success ? 'success' : 'failure',
      risk: 'high',
      sessionId: req.sessionID,
    });
  }

  // Admin actions
  logAdminAction(
    req: Request,
    userId: string,
    userEmail: string,
    action: string,
    targetUserId?: string,
    details: Record<string, any> = {}
  ) {
    this.log({
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: `ADMIN_${action.toUpperCase()}`,
      resource: 'admin',
      details: {
        ...details,
        targetUserId,
      },
      result: 'success',
      risk: 'critical',
      sessionId: req.sessionID,
    });
  }

  // File upload events
  logFileUpload(
    req: Request,
    userId: string,
    userEmail: string,
    fileName: string,
    fileSize: number,
    success: boolean
  ) {
    this.log({
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'FILE_UPLOAD',
      resource: 'storage',
      details: {
        fileName,
        fileSize,
        success,
        type: 'audio',
      },
      result: success ? 'success' : 'failure',
      risk: 'medium',
      sessionId: req.sessionID,
    });
  }

  // OAuth events
  logOAuthConnection(
    req: Request,
    userId: string,
    userEmail: string,
    platform: string,
    success: boolean
  ) {
    this.log({
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'OAUTH_CONNECT',
      resource: 'social_media',
      details: {
        platform,
        success,
      },
      result: success ? 'success' : 'failure',
      risk: 'medium',
      sessionId: req.sessionID,
    });
  }

  // Security events
  logSecurityEvent(
    req: Request,
    event: string,
    risk: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any> = {}
  ) {
    this.log({
      timestamp: new Date().toISOString(),
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: `SECURITY_${event.toUpperCase()}`,
      resource: 'security',
      details,
      result: 'success',
      risk,
      sessionId: req.sessionID,
    });
  }

  // Rate limiting events
  logRateLimit(req: Request, limitType: string) {
    this.log({
      timestamp: new Date().toISOString(),
      ip: this.getClientIP(req),
      userAgent: req.get('user-agent') || 'unknown',
      action: 'RATE_LIMIT_EXCEEDED',
      resource: 'security',
      details: {
        limitType,
        path: req.path,
      },
      result: 'failure',
      risk: 'medium',
    });
  }

  private getClientIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}

export const auditLogger = new AuditLogger();

// Middleware for automatic API endpoint auditing
export function auditMiddleware(
  action: string,
  resource: string,
  risk: 'low' | 'medium' | 'high' = 'low'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;

    res.send = function (data) {
      const user = (req as Record<string, unknown>).user;
      const statusCode = res.statusCode;

      if (user && statusCode < 400) {
        auditLogger.log({
          timestamp: new Date().toISOString(),
          userId: user.id,
          userEmail: user.email,
          ip: auditLogger['getClientIP'](req),
          userAgent: req.get('user-agent') || 'unknown',
          action,
          resource,
          details: {
            method: req.method,
            path: req.path,
            statusCode,
          },
          result: 'success',
          risk,
          sessionId: req.sessionID,
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}
