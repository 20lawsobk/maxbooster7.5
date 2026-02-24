import { Request, Response, NextFunction } from 'express';
import { type Server } from 'http';
import { logger } from '../logger.js';
import { auditLogger } from './auditLogger.js';

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
    context?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.context = context;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
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
  issues?: any[];
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
    const anyErr = err as any;
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: typeof anyErr.statusCode === 'number' ? anyErr.statusCode : (typeof anyErr.status === 'number' ? anyErr.status : 500),
      status: typeof anyErr.status === 'number' ? anyErr.status : undefined,
      code: typeof anyErr.code === 'string' ? anyErr.code : undefined,
      isOperational: typeof anyErr.isOperational === 'boolean' ? anyErr.isOperational : false,
      issues: Array.isArray(anyErr.issues) ? anyErr.issues : undefined,
      context: anyErr.context && typeof anyErr.context === 'object' ? anyErr.context : undefined,
    };
  }

  if (err && typeof err === 'object') {
    const anyErr = err as any;
    return {
      name: typeof anyErr.name === 'string' ? anyErr.name : 'UnknownError',
      message: typeof anyErr.message === 'string' ? anyErr.message : String(err),
      stack: typeof anyErr.stack === 'string' ? anyErr.stack : undefined,
      statusCode: typeof anyErr.statusCode === 'number' ? anyErr.statusCode : (typeof anyErr.status === 'number' ? anyErr.status : 500),
      code: typeof anyErr.code === 'string' ? anyErr.code : undefined,
      isOperational: typeof anyErr.isOperational === 'boolean' ? anyErr.isOperational : false,
      issues: Array.isArray(anyErr.issues) ? anyErr.issues : undefined,
      context: anyErr.context && typeof anyErr.context === 'object' ? anyErr.context : undefined,
    };
  }

  return {
    name: 'UnknownError',
    message: typeof err === 'string' ? err : 'Internal Server Error',
    statusCode: 500,
    isOperational: false,
  };
}

function extractReasonInfo(reason: unknown): { message: string; code?: string; stack?: string } {
  if (reason instanceof Error) {
    const anyReason = reason as any;
    return {
      message: reason.message,
      code: typeof anyReason.code === 'string' ? anyReason.code : undefined,
      stack: reason.stack,
    };
  }
  if (reason && typeof reason === 'object') {
    const anyReason = reason as any;
    return {
      message: typeof anyReason.message === 'string' ? anyReason.message : String(reason),
      code: typeof anyReason.code === 'string' ? anyReason.code : undefined,
      stack: typeof anyReason.stack === 'string' ? anyReason.stack : undefined,
    };
  }
  return {
    message: typeof reason === 'string' ? reason : 'Unknown rejection reason',
  };
}

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const normalized = normalizeError(err);

  let statusCode = normalized.statusCode;
  let message = normalized.message;
  let code = normalized.code;
  let isOperational = normalized.isOperational;

  if (normalized.name === 'ZodError') {
    statusCode = 400;
    const issues = normalized.issues || [];
    const firstIssue = issues[0];
    message = firstIssue
      ? `Validation failed: ${firstIssue.path?.length ? firstIssue.path.join('.') + ' - ' : ''}${firstIssue.message}`
      : 'Validation failed';
    code = 'VALIDATION_ERROR';
    isOperational = true;
  } else if (normalized.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
    isOperational = true;
  } else if (normalized.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
    code = 'INVALID_FORMAT';
    isOperational = true;
  } else if (normalized.code === '23505') {
    statusCode = 409;
    message = 'Resource already exists';
    code = 'DUPLICATE_RESOURCE';
    isOperational = true;
  } else if (normalized.code === '23503') {
    statusCode = 400;
    message = 'Referenced resource not found';
    code = 'INVALID_REFERENCE';
    isOperational = true;
  } else if (normalized.name === 'MulterError') {
    statusCode = 400;
    if (normalized.code === 'LIMIT_FILE_SIZE') {
      message = 'File size too large';
      code = 'FILE_TOO_LARGE';
    } else if (normalized.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded';
      code = 'TOO_MANY_FILES';
    } else {
      message = 'File upload error';
      code = 'UPLOAD_ERROR';
    }
    isOperational = true;
  } else if (normalized.name === 'PaymentError') {
    statusCode = 402;
    code = 'PAYMENT_FAILED';
    isOperational = true;
  }

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] as string,
    }
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = {
      stack: normalized.stack,
      context: normalized.context,
    };
  }

  auditLogger.log({
    timestamp: new Date().toISOString(),
    userId: (req as any).user?.id,
    userEmail: (req as any).user?.email,
    ip: req.ip || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
    action: 'ERROR_HANDLED',
    resource: 'system',
    details: {
      error: {
        name: normalized.name,
        message: normalized.message,
        code: normalized.code,
        stack: process.env.NODE_ENV === 'development' ? normalized.stack : undefined,
        isOperational,
      },
      request: {
        requestId: req.headers['x-request-id'],
        method: req.method,
        url: req.originalUrl,
        statusCode,
      }
    },
    result: statusCode >= 500 ? 'error' : 'failure',
    risk: statusCode >= 500 ? 'high' : 'medium',
    sessionId: req.sessionID,
  });

  if (statusCode >= 500 && !isOperational) {
    logger.error('CRITICAL ERROR:', {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      error: normalized.message,
      stack: normalized.stack,
      context: normalized.context,
      userId: (req as any).user?.id,
      ip: req.ip,
    });
  }

  if (res.headersSent) {
    logger.error('[errorHandler] Headers already sent, cannot send error response', {
      method: req.method,
      url: req.originalUrl,
      statusCode,
    });
    return;
  }

  res.status(statusCode).json(errorResponse);
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function handleUnhandledRejection(server?: Server) {
  process.on('unhandledRejection', (reason: unknown, _promise: Promise<any>) => {
    const info = extractReasonInfo(reason);

    const isRedisError = (
      (info.message.includes('ECONNREFUSED') && (info.message.includes('6379') || info.code === 'ECONNREFUSED')) ||
      info.message.includes('Redis') ||
      info.message.includes('Connection is closed')
    );

    if (isRedisError && process.env.NODE_ENV === 'development') {
      return;
    }

    logger.error('UNHANDLED PROMISE REJECTION:', {
      reason: info.message,
      stack: info.stack,
      timestamp: new Date().toISOString(),
    });

    auditLogger.log({
      timestamp: new Date().toISOString(),
      ip: 'system',
      userAgent: 'node-process',
      action: 'UNHANDLED_REJECTION',
      resource: 'system',
      details: {
        reason: info.message,
        stack: info.stack,
      },
      result: 'error',
      risk: 'critical'
    });

    if (process.env.NODE_ENV === 'production') {
      logger.info('Starting graceful shutdown due to unhandled promise rejection...');
      gracefulShutdown(server, 'UNHANDLED_REJECTION');
    }
  });
}

export function handleUncaughtException(server?: Server) {
  process.on('uncaughtException', (error: Error) => {
    logger.error('UNCAUGHT EXCEPTION:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    auditLogger.log({
      timestamp: new Date().toISOString(),
      ip: 'system',
      userAgent: 'node-process',
      action: 'UNCAUGHT_EXCEPTION',
      resource: 'system',
      details: {
        error: error.message,
        stack: error.stack,
      },
      result: 'error',
      risk: 'critical'
    });

    logger.info('Starting graceful shutdown due to uncaught exception...');
    gracefulShutdown(server, 'UNCAUGHT_EXCEPTION');
  });
}

function gracefulShutdown(server: Server | undefined, reason: string) {
  logger.info(`Graceful shutdown initiated (${reason})`);

  if (server && typeof server.close === 'function') {
    server.close((err?: Error) => {
      if (err) {
        logger.error('Error during server shutdown:', { error: err.message });
      } else {
        logger.info('HTTP server closed');
      }

      setTimeout(() => {
        logger.info('Force exit after graceful shutdown timeout');
        process.exit(1);
      }, 10000);

      process.exit(1);
    });
  } else {
    process.exit(1);
  }
}

export function setupGracefulShutdown(server: Server) {
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    gracefulShutdown(server, 'SIGTERM');
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received');
    gracefulShutdown(server, 'SIGINT');
  });
}
