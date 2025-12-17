import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { auditLogger } from './auditLogger.js';

interface RequestLogData {
  timestamp: string;
  requestId: string;
  method: string;
  url: string;
  ip: string;
  userAgent: string;
  userId?: string;
  sessionId?: string;
  statusCode?: number;
  responseTime?: number;
  bodySize?: number;
  query?: Record<string, any>;
  referrer?: string;
}

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Capture request details
  const logData: RequestLogData = {
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
    userId: (req as any).user?.id,
    sessionId: req.sessionID,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    referrer: req.get('referrer'),
  };

  // Override res.end to capture response details
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, encoding?: unknown, cb?: unknown): any {
    const responseTime = Date.now() - startTime;

    // Update log data with response information
    logData.statusCode = res.statusCode;
    logData.responseTime = responseTime;
    logData.bodySize = chunk ? Buffer.byteLength(chunk) : 0;

    // Determine log level based on status code
    const isError = res.statusCode >= 400;
    const isServerError = res.statusCode >= 500;

    // Skip logging of static assets and health checks in production
    const skipLogging =
      process.env.NODE_ENV === 'production' &&
      (req.originalUrl.includes('/src/') ||
        req.originalUrl.includes('/@fs/') ||
        req.originalUrl.includes('/@vite') ||
        req.originalUrl.includes('.map') ||
        req.originalUrl.includes('/api/health') ||
        req.originalUrl.includes('/api/ready') ||
        req.originalUrl.includes('/api/live'));

    if (!skipLogging) {
      // Log request for audit trail
      auditLogger.log({
        timestamp: logData.timestamp,
        userId: logData.userId,
        userEmail: (req as any).user?.email,
        ip: logData.ip,
        userAgent: logData.userAgent,
        action: 'HTTP_REQUEST',
        resource: `${req.method} ${req.route?.path || req.originalUrl}`,
        details: {
          request: {
            id: logData.requestId,
            method: logData.method,
            url: logData.url,
            query: logData.query,
            referrer: logData.referrer,
          },
          response: {
            statusCode: logData.statusCode,
            responseTime: logData.responseTime,
            bodySize: logData.bodySize,
          },
        },
        result: isError ? 'failure' : 'success',
        risk: isServerError ? 'high' : isError ? 'medium' : 'low',
        sessionId: logData.sessionId,
      });

      // Console log for development and critical errors
      if (process.env.NODE_ENV === 'development' || isServerError) {
        const logLevel = isServerError ? 'error' : isError ? 'warn' : 'info';
        const message = `${logData.method} ${logData.url} - ${logData.statusCode} in ${responseTime}ms`;

        if (logLevel === 'error') {
          logger.error(`❌ ${message}`, { requestId: logData.requestId });
        } else if (logLevel === 'warn') {
          logger.warn(`⚠️  ${message}`, { requestId: logData.requestId });
        } else {
          logger.info(`✅ ${message}`);
        }
      }
    }

    // Call original end method
    return originalEnd(chunk, encoding, cb);
  } as any;

  next();
}

// Error context middleware - adds context to errors for better debugging
export function errorContext(req: Request, res: Response, next: NextFunction): void {
  // Add request context to any errors that occur
  const originalNext = next;
  next = function (error?: unknown) {
    if (error) {
      // Enhance error with request context
      error.requestContext = {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: (req as any).user?.id,
        sessionId: req.sessionID,
        timestamp: new Date().toISOString(),
      };
    }
    originalNext(error);
  };

  next();
}
