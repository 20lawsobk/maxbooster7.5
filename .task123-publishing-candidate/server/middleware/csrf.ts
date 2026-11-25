import { randomBytes, timingSafeEqual } from "crypto";
import { RequestHandler, Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { isProductionEnv } from "../lib/envHelpers.js";

export const CSRF_COOKIE = "csrf-token";
export const CSRF_HEADER = "x-csrf-token";

const isProduction = isProductionEnv();

function setCsrfNoStoreHeaders(res: Response): void {
  res.set({
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.vary("Cookie");
}

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a?.length !== b?.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer?.from(a), Buffer?.from(b));
  } catch {
    return false;
  }
}

const validateCsrfToken: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = (req.headers[CSRF_HEADER] as string) || req.body?._csrf;

  if (!cookieToken) {
    logger.warn(
      { ip: req.ip, userAgent: req.get("user-agent") },
      `CSRF validation failed: Missing CSRF cookie - ${req.method} ${req.path}`,
    );
    return res.status(403).json({
      error: "CSRF validation failed",
      message: "Missing security token. Please refresh the page and try again.",
    });
  }

  if (!headerToken) {
    logger.warn(
      { ip: req.ip, userAgent: req.get("user-agent") },
      `CSRF validation failed: Missing CSRF header/body token - ${req.method} ${req.path}`,
    );
    return res.status(403).json({
      error: "CSRF validation failed",
      message:
        "Missing security token in request. Please refresh the page and try again.",
    });
  }

  if (!safeCompare(cookieToken, headerToken)) {
    logger.warn(
      { ip: req.ip, userAgent: req.get("user-agent") },
      `CSRF validation failed: Token mismatch - ${req.method} ${req.path}`,
    );
    return res.status(403).json({
      error: "CSRF validation failed",
      message: "Invalid security token. Please refresh the page and try again.",
    });
  }

  next();
};

export const csrfProtection: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(req.method)) {
    return next();
  }
  return validateCsrfToken(req, res, next);
};

/** Explicit token validation even for a read endpoint whose recovery receipt
 * should only be observable from the same protected operator session. */
export const requireCsrfToken: RequestHandler = validateCsrfToken;

export const generateCsrfToken: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = randomBytes(32).toString("hex");
    setCsrfNoStoreHeaders(res);
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    (req as unknown as Record<string, unknown>).csrfToken = token;
  } else {
    (req as unknown as Record<string, unknown>).csrfToken = req.cookies[CSRF_COOKIE];
  }

  next();
};

export const getCsrfToken: RequestHandler = (req: Request, res: Response) => {
  // generateCsrfToken is mounted globally ahead of every route and has
  // already ensured the cookie exists (generating + setting it exactly
  // once if it didn't) and stashed that same value on req.csrfToken.
  // Re-deriving from req.cookies here and independently regenerating when
  // "missing" used to race with that middleware: req.cookies reflects the
  // *incoming* request, not the Set-Cookie generateCsrfToken had just
  // queued on the response, so on a client's very first request this
  // handler would mint a SECOND, different random token and emit a
  // second Set-Cookie header — leaving the JSON body and the cookie a
  // client actually ends up storing potentially out of sync.
  const token =
    (req as unknown as { csrfToken?: string }).csrfToken ??
    req.cookies?.[CSRF_COOKIE];

  setCsrfNoStoreHeaders(res);
  res.json({ csrfToken: token });
};

export const refreshCsrfToken: RequestHandler = (
  _req: Request,
  res: Response,
) => {
  const token = randomBytes(32).toString("hex");
  setCsrfNoStoreHeaders(res);
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ csrfToken: token });
};

const CSRF_EXEMPT_PATHS = [
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify",
  "/api/auth/token/refresh",
  "/api/auth/google",
  "/api/csrf-token",
  "/api/errors",
  "/api/metrics/web-vitals",
  "/api/dns/query",
  "/api/dev/", // dev-only triggers, never exist in production
  "/api/dns/resolve",
  "/api/dns/resolver/",
  "/api/uploads/direct/",
  "/health",
  "/ready",
  "/status",
  // Internal server-to-server paths — already protected by BOOSTERSTATE_SECRET bearer token
  "/api/ai-service/",
  "/api/training/internal/",
];

// These exact POST consumers verify provider signatures before any writes.
// Never exempt a webhook namespace or a lookalike descendant.
const PROVIDER_POST_PATHS = new Set([
  "/api/webhooks/stripe",
  "/webhooks/sendgrid",
  "/api/webhooks/resend",
  "/api/notifications/sms/status",
  "/api/notifications/sms/incoming",
]);

export const csrfProtectionWithExemptions: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Use originalUrl (never rewritten by Express mount logic) so the check is
  // reliable regardless of which router or sub-app this middleware runs inside.
  const urlPath = (req.originalUrl || req.path || "").split("?")[0];
  if (req.method === "POST" && PROVIDER_POST_PATHS.has(urlPath)) return next();
  const isExempt = CSRF_EXEMPT_PATHS?.some((p) => urlPath?.startsWith(p));

  if (isExempt) {
    return next();
  }

  // Secondary escape-hatch: server-to-server calls authenticated with the
  // BOOSTERSTATE_SECRET bearer token never carry a browser CSRF cookie.
  // The secret is only known to internal services, so accepting it here is safe.
  const internalSecret = process.env.BOOSTERSTATE_SECRET;
  if (internalSecret) {
    const auth = req.headers["authorization"] as string | undefined;
    const provided = auth?.startsWith("Bearer ") ? auth?.slice(7) : "";
    if (provided && provided === internalSecret) {
      return next();
    }
  }

  return csrfProtection(req, res, next);
};
