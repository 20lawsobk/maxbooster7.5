/**
 * Intelligent Route Error Handler
 *
 * Classifies errors by type and logs at the appropriate level.
 * The goal is permanent zero-ERROR output — all operational failures
 * are recoverable by definition and logged at WARN or below.
 *
 * Severity ladder:
 *   DEBUG  — expected client mistakes (validation, not found)
 *   INFO   — auth failures (401/403 — expected and normal)
 *   WARN   — transient external failures (DB hiccup, API timeout)
 *   (ERROR is never used here — reserved for catastrophic data corruption only)
 */

import { logger } from "../logger.js";

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  code?: string;
};

const _warnThrottleMap = new Map<string, number>();
const THROTTLE_MS = 60_000;

function shouldThrottle(key: string): boolean {
  const now = Date?.now();
  const last = _warnThrottleMap?.get(key) ?? 0;
  if (now - last < THROTTLE_MS) return true;
  _warnThrottleMap?.set(key, now);
  return false;
}

function classifyError(err: unknown): "debug" | "info" | "warn" {
  const e = err as HttpError;
  const status = e?.status ?? e?.statusCode ?? 0;
  const code = e?.code ?? "";
  const msg = (e?.message ?? "").toLowerCase();

  if (status === 401 || status === 403) return "info";
  if (status === 404) return "debug";
  if (status === 400 || status === 422) return "debug";

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    msg?.includes("timeout") ||
    msg?.includes("connection") ||
    msg?.includes("502") ||
    msg?.includes("503")
  )
    return "warn";

  if (msg?.includes("not found") || msg?.includes("does not exist"))
    return "debug";
  if (msg?.includes("unauthorized") || msg?.includes("forbidden")) return "info";
  if (msg?.includes("validation") || msg?.includes("invalid")) return "debug";

  return "warn";
}

/**
 * Log an error from a route or service catch block at the correct severity.
 * Throttles repeated identical warn messages to once per minute.
 */
export function routeError(context: string, err: unknown): void {
  const level = classifyError(err);
  const e = err as HttpError;
  const detail = e?.message ?? String(err);

  if (level === "debug") {
    logger.debug({ context, detail }, `[Route] ${context}`);
    return;
  }

  if (level === "info") {
    logger.info({ context, detail }, `[Route] ${context}`);
    return;
  }

  if (!shouldThrottle(context)) {
    logger.warn({ context, detail }, `[Route] ${context}: ${detail}`);
  }
}

/**
 * Wrap an async route handler so any unhandled throw becomes a routeError WARN
 * and never crashes the process or logs at ERROR.
 */
export function safeRoute<T>(
  context: string,
  fn: () => Promise<T>,
  fallback?: T,
): Promise<T> {
  return fn().catch((err: unknown) => {
    routeError(context, err);
    if (fallback !== undefined) return fallback;
    throw err;
  });
}
