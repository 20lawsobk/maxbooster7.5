import { RequestHandler, Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { isProductionEnv } from "../lib/envHelpers.js";

// ── Param validation helpers ──────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const REGISTRATION_USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const REGISTRATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegistrationCheckoutBoundaryResult =
  | {
      ok: true;
      value: {
        tier: "monthly" | "yearly" | "lifetime";
        userEmail: string;
        username: string;
        birthdate: string;
        artistName: string;
        tosAccepted: true;
        privacyAccepted: true;
      };
    }
  | { ok: false; message: string };

function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

/**
 * Canonical public boundary for the unauthenticated Stripe registration checkout.
 * The downstream route still performs its own duplicate/Stripe/price checks; this
 * layer guarantees that every request entering that route has the same normalized
 * shape as the browser flow and has accepted the legal terms before payment.
 */
export function normalizeRegistrationCheckoutBody(
  body: unknown,
  now: Date = new Date(),
): RegistrationCheckoutBoundaryResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Invalid checkout request" };
  }

  const input = body as Record<string, unknown>;
  const tier = typeof input.tier === "string" ? input.tier.trim() : "";
  if (!(["monthly", "yearly", "lifetime"] as const).includes(tier as any)) {
    return { ok: false, message: "Invalid subscription tier" };
  }

  const userEmail =
    typeof input.userEmail === "string" ? input.userEmail.trim().toLowerCase() : "";
  if (
    !userEmail ||
    userEmail.length > 254 ||
    !REGISTRATION_EMAIL_RE.test(userEmail)
  ) {
    return { ok: false, message: "Invalid email format" };
  }

  const username =
    typeof input.username === "string" ? input.username.trim() : "";
  if (!REGISTRATION_USERNAME_RE.test(username)) {
    return {
      ok: false,
      message:
        "Username must be 3-30 characters and contain only letters, numbers, or underscores",
    };
  }

  const artistName =
    typeof input.artistName === "string" ? input.artistName.trim() : "";
  if (artistName.length > 100) {
    return {
      ok: false,
      message: "Artist / producer name must be 100 characters or fewer",
    };
  }

  const birthdate =
    typeof input.birthdate === "string" ? input.birthdate.trim() : "";
  const parsedBirthdate = parseCalendarDate(birthdate);
  if (!parsedBirthdate) {
    return { ok: false, message: "Invalid birthdate format" };
  }

  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (parsedBirthdate > todayUtc) {
    return { ok: false, message: "Birthdate cannot be in the future" };
  }
  const minimumBirthdate = new Date(todayUtc);
  minimumBirthdate.setUTCFullYear(minimumBirthdate.getUTCFullYear() - 13);
  if (parsedBirthdate > minimumBirthdate) {
    return {
      ok: false,
      message: "You must be at least 13 years old to create an account",
    };
  }

  if (input.tosAccepted !== true) {
    return {
      ok: false,
      message: "You must accept the Terms of Service before continuing to payment",
    };
  }
  if (input.privacyAccepted !== true) {
    return {
      ok: false,
      message: "You must accept the Privacy Policy before continuing to payment",
    };
  }

  return {
    ok: true,
    value: {
      tier: tier as "monthly" | "yearly" | "lifetime",
      userEmail,
      username,
      birthdate,
      artistName,
      tosAccepted: true,
      privacyAccepted: true,
    },
  };
}

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
 * Usage: router.get('/:id', requireUUIDParam('id'), handler)
 */
export function requireUUIDParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const val = req.params[paramName];
    if (!isValidUUID(val)) {
      return res.status(400).json({
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
 * Usage: router.get('/:slug', requireSafeParam('slug'), handler)
 */
export function requireSafeParam(paramName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const val = req.params[paramName];
    if (!isSafeId(val)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message: `Parameter '${paramName}' contains invalid characters.`,
      });
    }
    next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

const EXEMPT_PATH_PREFIXES = [
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
  const host = req.headers.host || "";
  const proto =
    req.secure || req.headers["x-forwarded-proto"] === "https"
      ? "https"
      : "http";

  const origins: string[] = [`${proto}://${host}`];

  const replSlug = process.env.REPL_SLUG;
  const replOwner = process.env.REPL_OWNER;
  if (replSlug && replOwner) {
    origins?.push(`https://${replSlug}.${replOwner}.repl.co`);
    origins?.push(`https://${replSlug}--${replOwner}.repl.co`);
    origins?.push(`https://${replSlug}.replit.app`);
  }

  const appUrl = process.env.APP_URL || process.env.REPLIT_APP_URL;
  if (appUrl) {
    try {
      origins?.push(new URL(appUrl).origin);
    } catch {}
  }

  // Always allow the platform's own custom domain and artist storefront subdomains.
  origins?.push(
    "https://maxbooster.replit.app",
    "https://max-booster.com",
    "https://www.max-booster.com",
  );

  return origins;
}

export const originValidation: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (
    req.method === "POST" &&
    req.path.replace(/\/$/, "") === "/api/create-checkout-session"
  ) {
    const boundary = normalizeRegistrationCheckoutBody(req.body);
    if (!boundary.ok) {
      return res.status(400).json({ error: boundary.message });
    }
    req.body = { ...(req.body as Record<string, unknown>), ...boundary.value };
  }

  if (SAFE_METHODS?.has(req.method)) return next();

  const isExempt = EXEMPT_PATH_PREFIXES?.some((prefix) =>
    req.path.startsWith(prefix),
  );
  if (isExempt) return next();

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;

  if (!origin && !referer) {
    if (!isProductionEnv()) return next();
    logger.warn({
      ip: req.ip,
      userAgent: req.get("user-agent"),
    }, `Mutation without Origin: ${req.method} ${req.path}`);
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

  const allowed = getAllowedOrigins(req);
  if (!allowed?.includes(requestOrigin)) {
    logger.warn({
      requestOrigin,
      allowed,
      ip: req.ip,
    }, `Origin blocked: ${req.method} ${req.path}`);
    return res.status(403).json({
      error: "Origin not allowed",
      message: "Request blocked: unexpected origin.",
    });
  }

  next();
};
