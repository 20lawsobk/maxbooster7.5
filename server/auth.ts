import type { Request, Response, NextFunction } from "express";
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
      const raw = await (client as Record<string, unknown>).get(redisKey);
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
      const count = await (client as Record<string, unknown>).incr(redisKey);
      if (count === 1)
        await (client as Record<string, unknown>).pexpire(
          redisKey,
          JWT_RL_WINDOW_MS,
        );
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
    return res
      .status(429)
      .json({
        message: "Too many failed JWT verification attempts. Try again later.",
      });
  }

  try {
    const decoded = await jwtAuthService?.verifyAccessToken(token);

    if (!decoded) {
      await recordJwtFailure(rlKey);
      return res.status(401).json({ message: "Invalid or revoked token" });
    }

    const user = await storage?.getUser(decoded?.userId);

    if (!user) {
      await recordJwtFailure(rlKey);
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name:
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email,
      subscriptionType: user.subscriptionTier || null,
      subscriptionStatus: user.subscriptionStatus || null,
      stripeCustomerId: user.stripeCustomerId || null,
      subscriptionEndDate: user.subscriptionEndsAt || null,
      trialEndDate: user.trialEndsAt || null,
    };

    next();
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
  // First check for passport?.js session authentication (req.isAuthenticated checks req.user)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  // Fallback: check for custom session userId
  if (req.session?.userId) {
    try {
      const user = await storage?.getUser(req.session.userId);

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name:
            `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
            user?.email,
          username: user.username,
          displayName:
            (user as Record<string, unknown>).displayName || user?.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: (user as Record<string, unknown>).avatarUrl || null,
          profileImageUrl:
            (user as Record<string, unknown>).profileImageUrl || null,
          bio: (user as Record<string, unknown>).bio || null,
          role: (user as Record<string, unknown>).role || "user",
          subscriptionType: user.subscriptionTier || null,
          subscriptionStatus: user.subscriptionStatus || null,
          stripeCustomerId: user.stripeCustomerId || null,
          subscriptionEndDate: user.subscriptionEndsAt || null,
          trialEndDate: user.trialEndsAt || null,
        };
        return next();
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Session auth error:");
    }
  }

  // Final fallback: try JWT authentication
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

  const user = await storage?.getUser(req.user.id);

  if (!user || user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
};

// Alias for backwards compatibility
export const requireAuth = requireAuthDual;

// Block write operations for demo users (read-only mode)
// NOTE: This middleware is mounted at '/api', so req.path strips the '/api' prefix.
// Use req.originalUrl for full-path matching or paths without the /api prefix.
export const blockDemoWrite = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if ((req as Record<string, unknown>).user?.email !== "demo@maxbooster.ai") {
    return next();
  }

  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (writeMethods?.includes(req.method)) {
    const fullPath = req.originalUrl.split("?")[0];
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
