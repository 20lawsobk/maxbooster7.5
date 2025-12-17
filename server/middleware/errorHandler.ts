import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { auditLogger } from './auditLogger.js';

// Custom error class for application errors
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

// Standardized error response format
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

// Enhanced global error handler
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set default error values
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code;
  let isOperational = err.isOperational || false;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
    isOperational = true;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
    code = 'INVALID_FORMAT';
    isOperational = true;
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
    code = 'DUPLICATE_RESOURCE';
    isOperational = true;
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Referenced resource not found';
    code = 'INVALID_REFERENCE';
    isOperational = true;
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size too large';
      code = 'FILE_TOO_LARGE';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files uploaded';
      code = 'TOO_MANY_FILES';
    } else {
      message = 'File upload error';
      code = 'UPLOAD_ERROR';
    }
    isOperational = true;
  } else if (err.name === 'PaymentError') {
    statusCode = 402;
    code = 'PAYMENT_FAILED';
    isOperational = true;
  }

  // Create standardized error response
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

  // Add stack trace and context in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = {
      stack: err.stack,
      context: err.context,
    };
  }

  // Log error to audit system
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
        name: err.name,
        message: err.message,
        code: err.code,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
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

  // Log critical errors for immediate attention
  if (statusCode >= 500 && !isOperational) {
    logger.error('🚨 CRITICAL ERROR:', {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      error: err.message,
      stack: err.stack,
      context: err.context,
      userId: (req as any).user?.id,
      ip: req.ip,
    });
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Handle unhandled promise rejections with graceful shutdown
export function handleUnhandledRejection(server?: unknown) {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
    // Suppress Redis connection errors in development (graceful degradation)
    const isRedisError = reason?.message?.includes('ECONNREFUSED') && 
                         (reason?.message?.includes('6379') || reason?.code === 'ECONNREFUSED') ||
                         reason?.message?.includes('Redis') ||
                         reason?.message?.includes('Connection is closed');
    
    if (isRedisError && process.env.NODE_ENV === 'development') {
      // Silently ignore Redis connection errors in development
      return;
    }

    logger.error('🚨 UNHANDLED PROMISE REJECTION:', {
      reason,
      stack: reason?.stack,
      timestamp: new Date().toISOString(),
    });

    // Log to audit system
    auditLogger.log({
      timestamp: new Date().toISOString(),
      ip: 'system',
      userAgent: 'node-process',
      action: 'UNHANDLED_REJECTION',
      resource: 'system',
      details: {
        reason: reason?.message || reason,
        stack: reason?.stack,
      },
      result: 'error',
      risk: 'critical'
    });

    // Graceful shutdown in production
    if (process.env.NODE_ENV === 'production') {
      logger.info('💥 Starting graceful shutdown due to unhandled promise rejection...');
      gracefulShutdown(server, 'UNHANDLED_REJECTION');
    }
  });
}

// Handle uncaught exceptions with graceful shutdown
export function handleUncaughtException(server?: unknown) {
  process.on('uncaughtException', (error: Error) => {
    logger.error('🚨 UNCAUGHT EXCEPTION:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    // Log to audit system
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

    logger.info('💥 Starting graceful shutdown due to uncaught exception...');
    gracefulShutdown(server, 'UNCAUGHT_EXCEPTION');
  });
}

// Graceful shutdown function
function gracefulShutdown(server: unknown, reason: string) {
  logger.info(`🛑 Graceful shutdown initiated (${reason})`);
  
  if (server) {
    // Stop accepting new connections
    server.close((err: unknown) => {
      if (err) {
        logger.error('❌ Error during server shutdown:', err);
      } else {
        logger.info('✅ HTTP server closed');
      }
      
      // Force exit after timeout if graceful shutdown takes too long
      setTimeout(() => {
        logger.info('💥 Force exit after graceful shutdown timeout');
        process.exit(1);
      }, 10000); // 10 second timeout
      
      // Exit process
      process.exit(1);
    });
  } else {
    // No server reference, exit immediately
    process.exit(1);
  }
}

// Setup graceful shutdown for SIGTERM/SIGINT
export function setupGracefulShutdown(server: unknown) {
  process.on('SIGTERM', () => {
    logger.info('📨 SIGTERM received');
    gracefulShutdown(server, 'SIGTERM');
  });
  
  process.on('SIGINT', () => {
    logger.info('📨 SIGINT received');
    gracefulShutdown(server, 'SIGINT');
  });
}
