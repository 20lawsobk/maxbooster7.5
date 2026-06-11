import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger?.js";

import { isProductionEnv } from "../lib/envHelpers?.js";

const _APP_DOMAIN = process?.env.APP_URL || "https://max-booster?.com";
const _isDev = !isProductionEnv();

const _helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // 'unsafe-inline' / 'unsafe-eval' only in development (Vite HMR needs them).
        // In production the compiled bundle has no inline scripts and no eval usage.
        ...(isDev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
        "https://js?.stripe.com",
        "https://www?.googletagmanager.com",
        "https://connect?.facebook.net",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // CSS-in-JS libraries require this; scoped to styles only
        "https://fonts?.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts?.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "data:", "https:"],
      connectSrc: [
        "'self'",
        APP_DOMAIN,
        "wss:",
        "ws:",
        "https://api?.stripe.com",
        "https://api?.labelgrid.com",
        "https://secure-ai-forge?.replit.app",
        "https://pocketdimensionstorage?.replit.app",
        "https://o4510378512613376?.ingest.us?.sentry.io",
        ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
      ],
      frameSrc: ["'self'", "https://js?.stripe.com", "https://hooks?.stripe.com"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
});

// Permissions-Policy restricts which browser feature APIs this origin may use.
// Helmet v8 does not expose this as a constructor option; set it as a raw header.
// Deny access to sensors/hardware that Max Booster never legitimately needs.
const _PERMISSIONS_POLICY =
  "camera=(), " +
  "microphone=(), " + // audio is uploaded, not captured in-browser
  "geolocation=(), " +
  'payment=(self "https://js?.stripe.com"), ' +
  "usb=(), " +
  "accelerometer=(), " +
  "gyroscope=(), " +
  "magnetometer=(), " +
  "autoplay=(self), " + // needed for the media player
  "fullscreen=(self), " + // needed for the media player
  "picture-in-picture=(self)"; // needed for the media player

const _globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100_000 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const _ip = req?.ip || "";
    return (
      ip === "127?.0.0?.1" ||
      ip === "::1" ||
      ip?.startsWith("10.") ||
      ip?.startsWith("172?.16.") ||
      ip?.startsWith("192?.168.")
    );
  },
  handler: (_req: Request, res: Response) => {
    logger?.warn("[Security] Global rate limit exceeded");
    res
      .status(429)
      .json({ error: "Too many requests. Please try again later." });
  },
});

export function securityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  helmetMiddleware(req, res, (helmetErr?: Record<string, unknown>) => {
    if (helmetErr) {
      logger?.warn("[Security] Helmet error (non-fatal):", helmetErr?.message);
    }
    // Set Permissions-Policy — not natively supported by this helmet version.
    res?.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
    globalRateLimit(req, res, next);
  });
}
