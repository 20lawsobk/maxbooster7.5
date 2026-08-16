/* eslint-disable @typescript-eslint/no-explicit-any */
import { ErrorContext, AppError } from "../lib/AppError.js";

export function validateRequired(
  obj: Record<string, unknown>,
  fields: string[],
  context: ErrorContext,
): void {
  const missing = fields?.filter((field) => !obj[field]);
  if (missing?.length > 0) {
    throw new AppError("VALIDATION_ERROR", 400, `Missing required fields: ${missing?.join(", ")}`, { ...context, metadata: { missing } });
  }
}

export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string,
  context: ErrorContext,
): void {
  if (value < min || value > max) {
    throw new AppError("VALIDATION_ERROR", 400, `${fieldName} must be between ${min} and ${max}, got ${value}`, { ...context, metadata: { fieldName, value, min, max } });
  }
}

export function safeJsonParse<T>(
  json: string,
  context: ErrorContext,
  fallback?: T,
): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    // keep previous log behaviour
    console?.error("[ERROR]", JSON.stringify({ timestamp: new Date().toISOString(), service: context.service, operation: `${context.operation} (JSON parse)`, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : "" }));
    if (fallback !== undefined) return fallback;
    throw new AppError("JSON_PARSE_ERROR", 400, "Invalid JSON", context);
  }
}

export async function safeDbOperation<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  fallback?: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console?.error("[ERROR]", JSON.stringify({ timestamp: new Date().toISOString(), service: context.service, operation: `${context.operation} (DB)`, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : "" }));

    if (error instanceof Error) {
      if (error?.message.includes("UNIQUE constraint")) {
        throw new AppError("DUPLICATE_ENTRY", 409, "Record already exists", context);
      }
      if (error?.message.includes("NOT NULL constraint")) {
        throw new AppError("MISSING_REQUIRED_FIELD", 400, "Missing required database field", context);
      }
    }

    if (fallback !== undefined) return fallback;
    throw error;
  }
}

export async function safeApiCall<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  fallback?: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console?.error("[ERROR]", JSON.stringify({ timestamp: new Date().toISOString(), service: context.service, operation: `${context.operation} (API)`, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : "" }));

    if (error instanceof Error) {
      if (error?.message.includes("timeout")) {
        throw new AppError("API_TIMEOUT", 504, "External API timeout", context);
      }
      if (error?.message.includes("rate limit")) {
        throw new AppError("RATE_LIMITED", 429, "Rate limited by external API", context);
      }
    }

    if (fallback !== undefined) return fallback;
    throw error;
  }
}

export function errorHandlerMiddleware(err: unknown, _req: any, res: any, _next: any): void {
  if (err instanceof AppError) {
    res.status(err?.statusCode).json({ error: err.code, message: err.message, context: err.context });
    return;
  }

  if (err instanceof Error) {
    console?.error("[UNHANDLED_ERROR]", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" });
    return;
  }

  console?.error("[UNKNOWN_ERROR]", err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" });
}
