import type { Request, Response, NextFunction } from "express";
import { enforceAssurance, markVerifiedJwtFactor } from "./middleware/authAssurance.js";
import { hasPaidFeatureAccess } from "./middleware/auth.js";
import { jwtAuthService } from "./services/jwtAuthService";
import { storage } from "./storage";
import { logger } from "./logger.js";
import { getRedisClient } from "./lib/redisConnectionFactory.js";

// Brute-force guard for JWT verification — counts ONLY failed attempts so
// legitimate high-traffic clients with valid tokens are never throttled.
// 30 failures per 15min per (IP + token-prefix) is plenty to stop guessing
// while leaving normal usage untouched.
const JWT_RL_WINDOW_MS = 15 * 60 * 1000;
const JWT_RL_MAX_FAILURES = 30;

const PAID_API_PATHS = new Set([
  "/api/dashboard/comprehensive",
  "/api/projects",
  "/api/ai/insights",
  "/api/ai/optimize-content",
]);
const PAID_API_PREFIXES = ["/api/studio", "/api/songwriting"];

function isPaidApiPath(path: string): boolean {
  return (
    PAID_API_PATHS.has(path) ||
    PAID_API_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  );
}

const localRl = new Map<string, { count: number; resetAt: number }>();
const localRlPrune = () => {
  const now = Date?.now();
  for (const [k, v] of localRl) if (v?.resetAt <= now) localRl?.delete(k);
};

async function isJwtBlocked(key: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (client) {
      const redisKey = `ratelimit:jwt:${key}`;
      const raw = (await (client as any).get(redisKey)) as string | null;
      const count = raw ? parseInt(raw, 10) : 0;
      return count >= JWT_RL_MAX_FAILURES;
    }
  } catch {
    /* fall through */
  }
  const entry = localRl?.get(key);
  if (!entry || entry?.resetAt <= Date?.now()) return false;
  return entry?.count >= JWT_RL_MAX_FAILURES;
}

async function recordJwtFailure(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (client) {
      const redisKey = `ratelimit:jwt:${key}`;
      const count = (await (client as any).incr(redisKey)) as number;
      if (count === 1)
        await (client as any).pexpire(redisKey, JWT_RL_WINDOW_MS);
      return;
    }
  } catch {
    /* fall through */
  }
  if (localRl?.size > 50_000) localRlPrune();
  const now = Date?.now();
  const entry = localRl?.get(key);
  if (!entry || entry?.resetAt <= now) {
    localRl?.set(key, { count: 1, resetAt: now + JWT_RL_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export const verifyJWT = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No JWT token provided" });
  }

  const token = authHeader?.substring(7);

  // Block brute-force only — gate by accumulated failures, not total traffic.
  const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
  const tokenPrefix = token?.slice(0, 16);
  const rlKey = `${ip}:${tokenPrefix}`;
  if (await isJwtBlocked(rlKey)) {
    return res.status(429).json({
      message: "Too many failed JWT verification attempts. Try again later.",
    });
  }

  try {
    const decoded = await jwtAuthService?.verifyAccessToken(token);

    if (!decoded) {
      await recordJwtFailure(rlKey);
      return res.status(401).json({ message: "Invalid or revoked token" });
    }

    const user = await storage.getUser(decoded?.userId);

    if (!user) {
      await recordJwtFailure(rlKey);
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    if (decoded.mfa === true) markVerifiedJwtFactor(req, user.id);
    if (enforceAssurance(req, res)) next();
  } catch (error: unknown) {
    await recordJwtFailure(rlKey);
    logger.warn({ err: error }, "JWT verification error:");
    return res.status(401).json({ message: "Token verification failed" });
  }
};

export const requireAuthDual = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (
    req.isAuthenticated &&
    req.isAuthenticated() &&
    req.user &&
    !req.headers.authorization
  ) {
    if (enforceAssurance(req, res)) return next();
    return;
  }

  if (req.session?.userId && !req.headers.authorization) {
    try {
      const user = await storage.getUser(req.session.userId);

      if (user) {
        req.user = user;
        if (enforceAssurance(req, res)) return next();
        return;
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Session auth error:");
    }
  }

  return verifyJWT(req, res, next);
};

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const user = await storage.getUser(req.user.id);

  if (!user || user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  if (enforceAssurance(req, res)) next();
};

export const requireAuth = requireAuthDual;

// Account-mode API guard. This middleware is mounted at `/api` after attachUser,
// so it is the earliest reliable place to enforce session-backed paid feature
// access before handlers that still use legacy inline `req.user` checks.
// It also preserves the existing read-only demo-account policy.
export const blockDemoWrite = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const fullPath =
    req.originalUrl.split("?")[0].replace(/\/+$/, "") || "/";

  if (
    req.user &&
    isPaidApiPath(fullPath) &&
    !hasPaidFeatureAccess(req.user)
  ) {
    return res.status(403).json({
      error: "Paid subscription required",
      code: "PAID_SUBSCRIPTION_REQUIRED",
      upgradeUrl: "/pricing",
    });
  }

  if (
    (req.user as { email?: string } | undefined)?.email !==
    "demo@maxbooster.ai"
  ) {
    return next();
  }

  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (writeMethods?.includes(req.method)) {
    const allowedDemoPaths = [
      "/api/auth/logout",
      "/api/auth/demo",
      "/api/auth/me",
      "/api/search",
      "/api/analytics",
    ];

    if (allowedDemoPaths?.some((path) => fullPath?.startsWith(path))) {
      return next();
    }

    logger.info(
      `Demo user blocked from write operation: ${req.method} ${fullPath}`,
    );
    return res.status(403).json({
      message: "Demo mode is read-only. Subscribe to unlock full access.",
      isDemo: true,
      upgradeUrl: "/pricing",
    });
  }

  next();
};
