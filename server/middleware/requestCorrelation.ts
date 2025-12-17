import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

// Cache for the maxBooster247 instance to avoid repeated imports
let maxBooster247Cache: any = null;
let importAttempted = false;

// Get reliability system at runtime using ES module imports
async function getMaxBooster247() {
  if (importAttempted && maxBooster247Cache) {
    return maxBooster247Cache;
  }

  if (!importAttempted) {
    try {
      const reliabilityModule = await import('../reliability-system.js');
      maxBooster247Cache = reliabilityModule.maxBooster247;
      importAttempted = true;
      return maxBooster247Cache;
    } catch (error: unknown) {
      logger.error('⚠️ Reliability system import failed:', error?.message || error);
      importAttempted = true;
      return null;
    }
  }

  return maxBooster247Cache;
}

// Extend Request interface to include request ID
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

// Request correlation middleware
export function requestCorrelation(req: Request, res: Response, next: NextFunction): void {
  // Generate or extract request ID
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    randomUUID();

  // Store request ID in request object
  req.requestId = requestId;
  req.startTime = Date.now();

  // Add request ID to response headers
  res.set('X-Request-ID', requestId);
  res.set('X-Correlation-ID', requestId);

  next();
}

// Performance monitoring middleware
export function performanceMonitoring(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  // Override res.end to capture timing
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, encoding?: unknown, cb?: unknown): any {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds

    // Add performance headers only if headers haven't been sent
    if (!res.headersSent) {
      res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
      res.set('X-Process-Time', `${Date.now() - req.startTime}ms`);
    }

    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn(`🐌 SLOW REQUEST: ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`, {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration.toFixed(2)}ms`,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
    }

    // Track request completion in reliability system (async safe)
    getMaxBooster247()
      .then((maxBooster247) => {
        if (maxBooster247) {
          try {
            maxBooster247.trackRequest(duration);

            // Track errors for 4xx/5xx responses
            if (res.statusCode >= 400) {
              maxBooster247.trackError(`HTTP ${res.statusCode}: ${req.method} ${req.originalUrl}`);
            }
          } catch (trackingError: unknown) {
            // Don't let tracking errors break requests
            logger.warn('⚠️ Request tracking failed:', trackingError);
          }
        }
      })
      .catch((error) => {
        logger.warn('⚠️ Request tracking import failed:', error.message);
      });

    // Properly forward all arguments to original end method
    if (arguments.length === 0) {
      return originalEnd();
    } else if (arguments.length === 1) {
      return originalEnd(chunk);
    } else if (arguments.length === 2) {
      return originalEnd(chunk, encoding);
    } else {
      return originalEnd(chunk, encoding, cb);
    }
  } as any;

  next();
}

// Memory monitoring middleware
export function memoryMonitoring(req: Request, res: Response, next: NextFunction): void {
  const initialMemory = process.memoryUsage();

  // Override res.end to capture memory usage
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, encoding?: unknown, cb?: unknown): any {
    const finalMemory = process.memoryUsage();
    const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

    // Add memory usage header only if headers haven't been sent
    if (!res.headersSent) {
      res.set('X-Memory-Usage', `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    }

    // Log memory leaks (> 10MB increase per request)
    if (memoryDelta > 10 * 1024 * 1024) {
      logger.warn(`🧠 MEMORY LEAK DETECTED: ${req.method} ${req.originalUrl}`, {
        requestId: req.requestId,
        memoryIncrease: `${Math.round(memoryDelta / 1024 / 1024)}MB`,
        currentHeapUsed: `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
        url: req.originalUrl,
      });
    }

    // Properly forward all arguments to original end method
    if (arguments.length === 0) {
      return originalEnd();
    } else if (arguments.length === 1) {
      return originalEnd(chunk);
    } else if (arguments.length === 2) {
      return originalEnd(chunk, encoding);
    } else {
      return originalEnd(chunk, encoding, cb);
    }
  } as any;

  next();
}
