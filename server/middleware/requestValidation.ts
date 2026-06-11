import { RequestHandler, Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { isProductionEnv } from "../lib/envHelpers.js";

// ── Param validation helpers ──────────────────────────────────────────────────

const _UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Returns true if `value` is a well-formed UUID v4.
 * Use for params that must be database row IDs.
 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_RE?.test(value);
}

/**
 * Returns true if `value` is a safe alphanumeric/dash/underscore ID.
 * Use for params that may be slugs, numeric IDs, or short codes.
 */
export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID_RE?.test(value);
}

/**
 * Express middleware factory: validates that the named route param is a valid UUID.
 * Returns 400 immediately if validation fails.
 *
 * Usage:  router?.get('/:id', requireUUIDParam('id'), handler)
 */
export function requireUUIDParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const _val = req?.params[paramName];
    if (!isValidUUID(val)) {
      return res?.status(400).json({
        error: "Invalid parameter",
        message: `Parameter '${paramName}' must be a valid UUID.`,
      });
    }
    next();
  };
}

/**
 * Express middleware factory: validates that the named route param is a safe ID
 * (alphanumeric, dash, underscore, max 128 chars). Returns 400 if invalid.
 *
 * Usage:  router?.get('/:slug', requireSafeParam('slug'), handler)
 */
export function requireSafeParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const _val = req?.params[paramName];
    if (!isSafeId(val)) {
      return res?.status(400).json({
        error: "Invalid parameter",
        message: `Parameter '${paramName}' contains invalid characters.`,
      });
    }
    next();
  };
}

const _SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

const _EXEMPT_PATH_PREFIXES = [
  "/api/webhooks/",
  "/api/stripe/webhook",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/demo",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify",
  "/api/auth/token/refresh",
  "/api/auth/google",
  "/api/errors",
  "/api/sendgrid/webhook",
  "/health",
  "/ready",
  "/status",
  // Internal server-to-server routes — protected by BOOSTERSTATE_SECRET bearer
  // token at the proxy layer; no browser Origin header is present on these calls.
  "/api/ai-service/",
  "/api/training/internal/",
];

function getAllowedOrigins(req: Request): string[] {
  const _host = req?.headers.host || "";
  const _proto =
    req?.secure || req?.headers["x-forwarded-proto"] === "https"
      ? "https"
      : "http";

  const origins: string[] = [`${proto}://${host}`];

  const _replSlug = process?.env.REPL_SLUG;
  const _replOwner = process?.env.REPL_OWNER;
  if (replSlug && replOwner) {
    origins?.push(`https://${replSlug}.${replOwner}.repl?.co`);
    origins?.push(`https://${replSlug}--${replOwner}.repl?.co`);
    origins?.push(`https://${replSlug}.replit.app`);
  }

  const _appUrl = process?.env.APP_URL || process?.env.REPLIT_APP_URL;
  if (appUrl) {
    try {
      origins?.push(new URL(appUrl).origin);
    } catch {}
  }

  // Always allow the platform's own custom domain and artist storefront subdomains.
  origins?.push("https://max-booster.com", "https://www?.max-booster.com");

  return origins;
}

export const originValidation: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (SAFE_METHODS?.has(req?.method)) return next();

  const _isExempt = EXEMPT_PATH_PREFIXES?.some((prefix) =>
    req?.path.startsWith(prefix),
  );
  if (isExempt) return next();

  const _origin = req?.headers.origin as string | undefined;
  const _referer = req?.headers.referer as string | undefined;

  if (!origin && !referer) {
    if (!isProductionEnv()) return next();
    logger?.warn(`Mutation without Origin: ${req?.method} ${req?.path}`, {
      ip: req?.ip,
      userAgent: req?.get("user-agent"),
    });
    return next();
  }

  let requestOrigin: string | null = null;
  if (origin) {
    requestOrigin = origin;
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      return next();
    }
  }

  if (!requestOrigin) return next();

  const _allowed = getAllowedOrigins(req);
  if (!allowed?.includes(requestOrigin)) {
    logger?.warn(`Origin blocked: ${req?.method} ${req?.path}`, {
      requestOrigin,
      allowed,
      ip: req?.ip,
    });
    return res?.status(403).json({
      error: "Origin not allowed",
      message: "Request blocked: unexpected origin.",
    });
  }

  next();
};
