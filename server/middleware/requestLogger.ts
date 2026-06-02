import { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { auditLogger } from "./auditLogger.js";
import { isRoutesReady } from "../lib/bootState.js";

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
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  // Capture request details
  const logData: RequestLogData = {
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || "unknown",
    userAgent: req.get("user-agent") || "unknown",
    userId: (req as Record<string, unknown>).user?.id,
    sessionId: req.sessionID,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    referrer: req.get("referrer"),
  };

  // Override res.end to capture response details
  const originalEnd = res.end.bind(res);
  res.end = function (
    chunk?: unknown,
    encoding?: unknown,
    cb?: unknown,
  ): Record<string, unknown> {
    const responseTime = Date.now() - startTime;

    // Update log data with response information
    logData.statusCode = res.statusCode;
    logData.responseTime = responseTime;
    logData.bodySize = chunk ? Buffer.byteLength(chunk) : 0;

    // Determine log level based on status code
    const isError = res.statusCode >= 400;
    const isServerError = res.statusCode >= 500;

    // Static/Vite asset paths — browser SW cache mismatches produce transient 404s on every
    // restart; these are not actionable and should never surface as WARN.
    const isStaticAssetRequest =
      req.originalUrl.startsWith("/assets/") ||
      req.originalUrl.startsWith("/src/") ||
      req.originalUrl.startsWith("/@fs/") ||
      req.originalUrl.startsWith("/@vite") ||
      /\.(js|css|map|woff2?|ttf|eot|svg|png|ico|webp)(\?|$)/.test(
        req.originalUrl,
      );

    // Skip logging of static assets and health checks in production; also skip static
    // assets in dev to avoid noise from browser SW cache mismatches.
    const skipLogging =
      req.originalUrl.includes("/api/health") ||
      req.originalUrl.includes("/api/version") ||
      req.originalUrl.includes("/api/ready") ||
      req.originalUrl.includes("/api/live") ||
      ((process.env.NODE_ENV === "production" ||
        !!process.env.REPLIT_DEPLOYMENT) &&
        isStaticAssetRequest);

    if (!skipLogging) {
      // Log request for audit trail
      auditLogger.log({
        timestamp: logData.timestamp,
        userId: logData.userId,
        userEmail: (req as Record<string, unknown>).user?.email,
        ip: logData.ip,
        userAgent: logData.userAgent,
        action: "HTTP_REQUEST",
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
        result: isError ? "failure" : "success",
        risk: isServerError ? "high" : isError ? "medium" : "low",
        sessionId: logData.sessionId,
      });

      // Console log for development and critical errors
      if (
        (process.env.NODE_ENV !== "production" &&
          !process.env.REPLIT_DEPLOYMENT) ||
        isServerError
      ) {
        // 401/403 are expected auth flows (e.g. unauthenticated polling) — log at INFO.
        // 404s on static/asset paths are browser SW cache artifacts — log at INFO.
        // 404s during the boot window (before registerRoutes() completes) are startup
        // races — the route is not yet mounted, not a real missing-endpoint error.
        const isAuthStatus = res.statusCode === 401 || res.statusCode === 403;
        const isAsset404 = res.statusCode === 404 && isStaticAssetRequest;
        const isBootWindow404 = res.statusCode === 404 && !isRoutesReady();
        const logLevel = isServerError
          ? "error"
          : isError && !isAuthStatus && !isAsset404 && !isBootWindow404
            ? "warn"
            : "info";
        const message = `${logData.method} ${logData.url} - ${logData.statusCode} in ${responseTime}ms`;

        if (logLevel === "error") {
          logger.warn(`❌ ${message}`, { requestId: logData.requestId });
        } else if (logLevel === "warn") {
          logger.warn(`⚠️  ${message}`, { requestId: logData.requestId });
        } else {
          logger.info(`✅ ${message}`);
        }
      }
    }

    // Call original end method
    return originalEnd(chunk, encoding, cb);
  } as Record<string, unknown>;

  next();
}

// Error context middleware - adds context to errors for better debugging
export function errorContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
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
        userAgent: req.get("user-agent"),
        userId: (req as Record<string, unknown>).user?.id,
        sessionId: req.sessionID,
        timestamp: new Date().toISOString(),
      };
    }
    originalNext(error);
  };

  next();
}
