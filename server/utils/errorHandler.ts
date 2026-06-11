/**
 * Centralized Error Handler
 * Provides consistent error handling, logging, and recovery patterns
 * Used across all services, especially low-coverage areas
 */

export interface ErrorContext {
  service: string;
  operation: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public context?: ErrorContext
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Safe async wrapper with automatic error handling and logging
 * Prevents unhandled promise rejections
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  fallback?: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(error, context);
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Safe sync wrapper with automatic error handling
 */
export function safeSync<T>(
  fn: () => T,
  context: ErrorContext,
  fallback?: T
): T {
  try {
    return fn();
  } catch (error) {
    logError(error, context);
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Centralized error logging
 */
export function logError(
  error: unknown,
  context: ErrorContext
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : "";

  const logEntry = {
    timestamp: new Date().toISOString(),
    service: context.service,
    operation: context.operation,
    userId: context.userId,
    error: errorMessage,
    stack: errorStack,
    metadata: context.metadata,
  };

  console.error("[ERROR]", JSON.stringify(logEntry));
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  maxRetries: number = 3,
  initialDelayMs: number = 100
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delayMs = initialDelayMs * Math.pow(2, attempt);

      logError(error, {
        ...context,
        operation: `${context.operation} (retry ${attempt + 1}/${maxRetries})`,
      });

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Validate required fields
 */
export function validateRequired(
  obj: Record<string, unknown>,
  fields: string[],
  context: ErrorContext
): void {
  const missing = fields.filter((field) => !obj[field]);
  if (missing.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `Missing required fields: ${missing.join(", ")}`,
      { ...context, metadata: { missing } }
    );
  }
}

/**
 * Validate numeric range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string,
  context: ErrorContext
): void {
  if (value < min || value > max) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `${fieldName} must be between ${min} and ${max}, got ${value}`,
      { ...context, metadata: { fieldName, value, min, max } }
    );
  }
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(
  json: string,
  context: ErrorContext,
  fallback?: T
): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logError(error, { ...context, operation: `${context.operation} (JSON parse)` });
    if (fallback !== undefined) {
      return fallback;
    }
    throw new AppError(
      "JSON_PARSE_ERROR",
      400,
      "Invalid JSON",
      context
    );
  }
}

/**
 * Safe database operation wrapper
 */
export async function safeDbOperation<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  fallback?: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(error, { ...context, operation: `${context.operation} (DB)` });

    // Check for specific DB errors
    if (error instanceof Error) {
      if (error.message.includes("UNIQUE constraint")) {
        throw new AppError(
          "DUPLICATE_ENTRY",
          409,
          "Record already exists",
          context
        );
      }
      if (error.message.includes("NOT NULL constraint")) {
        throw new AppError(
          "MISSING_REQUIRED_FIELD",
          400,
          "Missing required database field",
          context
        );
      }
    }

    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Safe API call wrapper
 */
export async function safeApiCall<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  fallback?: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(error, { ...context, operation: `${context.operation} (API)` });

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new AppError(
          "API_TIMEOUT",
          504,
          "External API timeout",
          context
        );
      }
      if (error.message.includes("rate limit")) {
        throw new AppError(
          "RATE_LIMITED",
          429,
          "Rate limited by external API",
          context
        );
      }
    }

    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Express error handler middleware
 */
export function errorHandlerMiddleware(
  err: unknown,
  _req: any,
  res: any,
  _next: any
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      context: err.context,
    });
  } else if (err instanceof Error) {
    console.error("[UNHANDLED_ERROR]", err);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });
  } else {
    console.error("[UNKNOWN_ERROR]", err);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });
  }
}
