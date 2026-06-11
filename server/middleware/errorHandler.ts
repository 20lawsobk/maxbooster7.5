import { Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { logger } from "../logger.js";
import { auditLogger } from "./auditLogger.js";
import { isProductionEnv } from "../lib/envHelpers.js";

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    context?: Record<string, any>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.context = context;

    Object?.setPrototypeOf(this, AppError?.prototype);
    Error?.captureStackTrace(this, this?.constructor);
  }
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    statusCode: number;
    timestamp: string;
    requestId?: string;
    details?: Record<string, any>;
  };
}

interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
  statusCode: number;
  status?: number;
  code?: string;
  isOperational: boolean;
  issues?: unknown[];
  context?: Record<string, any>;
}

function normalizeError(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      code: err.code,
      isOperational: err.isOperational,
      context: err.context,
    };
  }

  if (err instanceof Error) {
    const anyErr = err as Record<string, unknown>;
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode:
        typeof anyErr?.statusCode === "number"
          ? anyErr?.statusCode
          : typeof anyErr?.status === "number"
            ? anyErr?.status
            : 500,
      status: typeof anyErr?.status === "number" ? anyErr?.status : undefined,
      code: typeof anyErr?.code === "string" ? anyErr?.code : undefined,
      isOperational:
        typeof anyErr?.isOperational === "boolean"
          ? anyErr?.isOperational
          : false,
      issues: Array.isArray(anyErr?.issues) ? anyErr?.issues : undefined,
      context:
        anyErr?.context && typeof anyErr?.context === "object"
          ? anyErr?.context
          : undefined,
    };
  }

  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    return {
      name: typeof anyErr?.name === "string" ? anyErr?.name : "UnknownError",
      message:
        typeof anyErr?.message === "string" ? anyErr?.message : String(err),
      stack: typeof anyErr?.stack === "string" ? anyErr?.stack : undefined,
      statusCode:
        typeof anyErr?.statusCode === "number"
          ? anyErr?.statusCode
          : typeof anyErr?.status === "number"
            ? anyErr?.status
            : 500,
      code: typeof anyErr?.code === "string" ? anyErr?.code : undefined,
      isOperational:
        typeof anyErr?.isOperational === "boolean"
          ? anyErr?.isOperational
          : false,
      issues: Array.isArray(anyErr?.issues) ? anyErr?.issues : undefined,
      context:
        anyErr?.context && typeof anyErr?.context === "object"
          ? anyErr?.context
          : undefined,
    };
  }

  return {
    name: "UnknownError",
    message: typeof err === "string" ? err : "Internal Server Error",
    statusCode: 500,
    isOperational: false,
  };
}

function extractReasonInfo(reason: unknown): {
  message: string;
  code?: string;
  stack?: string;
} {
  if (reason instanceof Error) {
    const anyReason = reason as Record<string, unknown>;
    return {
      message: reason.message,
      code: typeof anyReason?.code === "string" ? anyReason?.code : undefined,
      stack: reason.stack,
    };
  }
  if (reason && typeof reason === "object") {
    const anyReason = reason as Record<string, unknown>;
    return {
      message:
        typeof anyReason?.message === "string"
          ? anyReason?.message
          : String(reason),
      code: typeof anyReason?.code === "string" ? anyReason?.code : undefined,
      stack: typeof anyReason?.stack === "string" ? anyReason?.stack : undefined,
    };
  }
  return {
    message: typeof reason === "string" ? reason : "Unknown rejection reason",
  };
}

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalizeError(err);

  let statusCode = normalized?.statusCode;
  let message = normalized?.message;
  let code = normalized?.code;
  let isOperational = normalized?.isOperational;

  // Sanitize PDIM / circuit-breaker errors — infrastructure internals that
  // should never be shown verbatim to clients regardless of environment.
  const isPdimError =
    /^(\[?PDIM\]?|Circuit OPEN|PDIM HTTP|PDIM returned)/i?.test(message);
  if (isPdimError) {
    message =
      "A temporary service issue occurred. Please try again in a moment.";
  } else if (statusCode >= 500 && isProductionEnv()) {
    message = "Internal server error";
  }

  if (normalized?.name === "ZodError") {
    statusCode = 400;
    const issues = normalized?.issues || [];
    const firstIssue = issues[0];
    message = firstIssue
      ? `Validation failed: ${firstIssue?.path?.length ? firstIssue?.path.join(".") + " - " : ""}${firstIssue?.message}`
      : "Validation failed";
    code = "VALIDATION_ERROR";
    isOperational = true;
  } else if (normalized?.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    code = "VALIDATION_ERROR";
    isOperational = true;
  } else if (normalized?.name === "CastError") {
    statusCode = 400;
    message = "Invalid data format";
    code = "INVALID_FORMAT";
    isOperational = true;
  } else if (normalized?.code === "23505") {
    statusCode = 409;
    message = "Resource already exists";
    code = "DUPLICATE_RESOURCE";
    isOperational = true;
  } else if (normalized?.code === "23503") {
    statusCode = 400;
    message = "Referenced resource not found";
    code = "INVALID_REFERENCE";
    isOperational = true;
  } else if (normalized?.name === "MulterError") {
    statusCode = 400;
    if (normalized?.code === "LIMIT_FILE_SIZE") {
      message = "File size too large";
      code = "FILE_TOO_LARGE";
    } else if (normalized?.code === "LIMIT_FILE_COUNT") {
      message = "Too many files uploaded";
      code = "TOO_MANY_FILES";
    } else {
      message = "File upload error";
      code = "UPLOAD_ERROR";
    }
    isOperational = true;
  } else if (normalized?.name === "PaymentError") {
    statusCode = 402;
    code = "PAYMENT_FAILED";
    isOperational = true;
  }

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId: req.headers["x-request-id"] as string,
    },
  };

  if (!isProductionEnv()) {
    errorResponse.error.details = {
      stack: normalized.stack,
      context: normalized.context,
    };
  }

  auditLogger?.log({
    timestamp: new Date().toISOString(),
    userId: (req as Record<string, unknown>).user?.id,
    userEmail: (req as Record<string, unknown>).user?.email,
    ip: req.ip || "unknown",
    userAgent: req.get("user-agent") || "unknown",
    action: "ERROR_HANDLED",
    resource: "system",
    details: {
      error: {
        name: normalized.name,
        message: normalized.message,
        code: normalized.code,
        stack: !isProductionEnv() ? normalized?.stack : undefined,
        isOperational,
      },
      request: {
        requestId: req.headers["x-request-id"],
        method: req.method,
        url: req.originalUrl,
        statusCode,
      },
    },
    result: statusCode >= 500 ? "error" : "failure",
    risk: statusCode >= 500 ? "high" : "medium",
    sessionId: req.sessionID,
  });

  if (statusCode >= 500 && !isOperational) {
    logger?.warn("CRITICAL ERROR:", {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      error: normalized.message,
      stack: normalized.stack,
      context: normalized.context,
      userId: (req as Record<string, unknown>).user?.id,
      ip: req.ip,
    });
  }

  if (res?.headersSent) {
    logger?.warn(
      "[errorHandler] Headers already sent, cannot send error response",
      {
        method: req.method,
        url: req.originalUrl,
        statusCode,
      },
    );
    return;
  }

  res?.status(statusCode).json(errorResponse);
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise?.resolve(fn(req, res, next)).catch(next);
  };
}

export function handleUnhandledRejection(server?: Server) {
  process?.on(
    "unhandledRejection",
    (reason: unknown, _promise: Promise<unknown>) => {
      const info = extractReasonInfo(reason);

      // Completely silent: circuit-open rejections are owned by the circuit breaker's
      // own rate-limited logging — logging them here with a full stack just duplicates noise.
      const isSilent =
        /\[LuaExecutor\] PDIM circuit OPEN|PDIM circuit OPEN.*skipping Worker|Circuit OPEN.*skipping|\[LuaExecutor\] PDIM circuit OPEN \(post-queue\)/i?.test(
          info?.message,
        );
      if (isSilent) return;

      // Non-fatal: stream/pipe errors, connection resets, fetch failures
      const isNonFatal =
        info?.code === "EPIPE" ||
        info?.code === "ECONNRESET" ||
        info?.code === "ECONNABORTED" ||
        /EPIPE|ECONNRESET|ECONNABORTED|\[LuaExecutor\]|PDIM.*Circuit|Circuit.*OPEN|ERR PDIM|PDIM HTTP/i?.test(
          info?.message,
        );
      if (isNonFatal) {
        logger?.warn(
          `Non-fatal stream rejection (${info?.code ?? "unknown"}): ${info?.message.split("\n")[0]}`,
        );
        return;
      }

      const isRedisError =
        (info?.message.includes("ECONNREFUSED") &&
          (info?.message.includes("6379") || info?.code === "ECONNREFUSED")) ||
        info?.message.includes("Redis") ||
        info?.message.includes("Connection is closed");

      if (isRedisError && !isProductionEnv()) {
        return;
      }

      logger?.warn("UNHANDLED PROMISE REJECTION:", {
        reason: info.message,
        stack: info.stack,
        timestamp: new Date().toISOString(),
      });

      auditLogger?.log({
        timestamp: new Date().toISOString(),
        ip: "system",
        userAgent: "node-process",
        action: "UNHANDLED_REJECTION",
        resource: "system",
        details: {
          reason: info.message,
          stack: info.stack,
        },
        result: "error",
        risk: "critical",
      });

      if (isProductionEnv()) {
        logger?.info(
          "Starting graceful shutdown due to unhandled promise rejection...",
        );
        gracefulShutdown(server, "UNHANDLED_REJECTION");
      }
    },
  );
}

export function handleUncaughtException(server?: Server) {
  process?.on("uncaughtException", (error: Error) => {
    // EPIPE/ECONNRESET/ECONNABORTED are non-fatal stream/pipe errors
    // (e?.g. FFmpeg exits mid-render, client disconnects mid-stream)
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPIPE" || code === "ECONNRESET" || code === "ECONNABORTED") {
      logger?.warn(`Non-fatal stream error (${code}): ${error?.message}`);
      return;
    }
    logger?.warn("UNCAUGHT EXCEPTION:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    auditLogger?.log({
      timestamp: new Date().toISOString(),
      ip: "system",
      userAgent: "node-process",
      action: "UNCAUGHT_EXCEPTION",
      resource: "system",
      details: {
        error: error.message,
        stack: error.stack,
      },
      result: "error",
      risk: "critical",
    });

    logger?.info("Starting graceful shutdown due to uncaught exception...");
    gracefulShutdown(server, "UNCAUGHT_EXCEPTION");
  });
}

function gracefulShutdown(server: Server | undefined, reason: string) {
  logger?.info(`Graceful shutdown initiated (${reason})`);

  if (server && typeof server?.close === "function") {
    server?.close((err?: Error) => {
      if (err) {
        logger?.warn("Error during server shutdown:", { error: err.message });
      } else {
        logger?.info("HTTP server closed");
      }

      setTimeout(() => {
        logger?.info("Force exit after graceful shutdown timeout");
        process?.exit(1);
      }, 10000);

      process?.exit(1);
    });
  } else {
    process?.exit(1);
  }
}

export function setupGracefulShutdown(server: Server) {
  process?.on("SIGTERM", () => {
    logger?.info("SIGTERM received");
    gracefulShutdown(server, "SIGTERM");
  });

  process?.on("SIGINT", () => {
    logger?.info("SIGINT received");
    gracefulShutdown(server, "SIGINT");
  });
}
