import type { Request, Response, NextFunction, RequestHandler } from "express";
import { randomBytes } from "crypto";
import { getRedisClient } from "../lib/redisConnectionFactory.js";
import { logger } from "../logger.js";

// Robust production detection: NODE_ENV may not be set correctly on some
// hosting environments. REPLIT_DEPLOYMENT is always set by Replit autoscale,
// so we treat either flag as production to prevent bypass via misconfig.
const isProductionEnv = (): boolean =>
  process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;

// ── Production rate limits calibrated for 90M-user scale ─────────────────────
// At 90M users with ~1% DAU = 900K concurrent-peak, these limits prevent
// individual IPs/users from monopolising server capacity while leaving ample
// headroom for legitimate traffic bursts on high-tier subscriptions.
//
// Enforcement strategy (defence-in-depth):
//   Layer 1 — express-rate-limit (security.ts): 2 000 req / 15 min per IP
//   Layer 2 — sliding-window Redis (here): per-IP and per-authenticated-user
//   Layer 3 — request queue load shedding at 90 % utilisation
//
// Values chosen conservatively; dial up via env-vars as real traffic data
// arrives. Auth endpoints remain at brute-force-safe levels always.

export const RATE_LIMITS = {
  global: {
    // 300 req/min per IP  (~5 req/s) — generous enough for SPA polling,
    // tight enough to blunt DDoS amplification.
    perIP: {
      windowMs: 60_000,
      max: Number(process.env.RATE_LIMIT_GLOBAL_IP ?? 300),
    },
    // 2 000 req/min per authenticated user — covers heavy dashboard use,
    // real-time analytics refresh, and bulk playlist operations.
    perUser: {
      windowMs: 60_000,
      max: Number(process.env.RATE_LIMIT_GLOBAL_USER ?? 2_000),
    },
  },
  auth: {
    login: { windowMs: 900_000, max: 10 }, // 10 per 15 min — brute-force guard
    register: { windowMs: 3_600_000, max: 10 }, // 10 per hour   — abuse guard
    forgotPassword: { windowMs: 3_600_000, max: 5 }, // 5 per hour    — abuse guard
    twoFactor: { windowMs: 300_000, max: 15 }, // 15 per 5 min  — brute-force guard
    captchaThreshold: 15,
  },
  billing: {
    // 60 req/min — Stripe calls are expensive; prevent runaway retry loops.
    perUser: {
      windowMs: 60_000,
      max: Number(process.env.RATE_LIMIT_BILLING ?? 60),
    },
  },
  uploads: {
    // 50 uploads per hour — prevents storage exhaustion via rapid-fire uploads.
    perUser: {
      windowMs: 3_600_000,
      max: Number(process.env.RATE_LIMIT_UPLOADS ?? 50),
    },
  },
  ai: {
    // 100 AI requests per hour — balances GPU cost against user experience.
    perUser: {
      windowMs: 3_600_000,
      max: Number(process.env.RATE_LIMIT_AI ?? 100),
    },
  },
  payouts: {
    // 10 payout requests per hour — financial ops are expensive; prevents
    // accidental or malicious payout floods.
    perUser: {
      windowMs: 3_600_000,
      max: Number(process.env.RATE_LIMIT_PAYOUTS ?? 10),
    },
  },
  kyc: {
    // 5 KYC submissions per hour — document uploads are heavyweight;
    // also guards against identity-verification abuse.
    perUser: {
      windowMs: 3_600_000,
      max: Number(process.env.RATE_LIMIT_KYC ?? 5),
    },
  },
};

const REDIS_KEY_PREFIX = "ratelimit:";

interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}

const DEGRADED_RATE_FRACTION = 0.25;
const DEGRADED_MAX_KEYS = 10_000;

class InMemoryDegradedRateLimiter {
  private store = new Map<string, number[]>();
  private lastPrune = Date.now();

  check(
    key: string,
    windowMs: number,
    maxRequests: number,
  ): SlidingWindowResult {
    const now = Date.now();
    const degradedMax = Math.max(
      1,
      Math.floor(maxRequests * DEGRADED_RATE_FRACTION),
    );

    if (now - this.lastPrune > 60_000) {
      this.prune(now);
    }

    if (!this.store.has(key) && this.store.size >= DEGRADED_MAX_KEYS) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + windowMs,
        total: degradedMax,
      };
    }

    const windowStart = now - windowMs;
    const timestamps = (this.store.get(key) || []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= degradedMax) {
      this.store.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetAt: timestamps[0] + windowMs,
        total: timestamps.length,
      };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);
    return {
      allowed: true,
      remaining: degradedMax - timestamps.length,
      resetAt: now + windowMs,
      total: timestamps.length,
    };
  }

  private prune(now: number): void {
    const cutoff = now - 3_600_000;
    for (const [key, timestamps] of this.store) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) this.store.delete(key);
      else this.store.set(key, fresh);
    }
    this.lastPrune = now;
  }
}

const degradedLimiter = new InMemoryDegradedRateLimiter();

function getClientIP(req: Request): string {
  // Prefer the validated real client IP set by cloudflareMiddleware (uses CF-Connecting-IP
  // only when the socket originates from a verified Cloudflare IP range, preventing spoofing).
  // Fall back to req.ip which respects Express trust proxy configuration.
  return (
    (req as Record<string, unknown>).realClientIp ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function getUserId(req: Request): string | null {
  const user = req.user as Record<string, unknown>;
  return user?.id || null;
}

async function slidingWindowCheck(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<SlidingWindowResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redis = await getRedisClient();

  if (!redis) {
    logger.warn("[RateLimit] Redis unavailable — degraded mode (25% limits)");
    return degradedLimiter.check(key, windowMs, maxRequests);
  }

  const redisKey = `${REDIS_KEY_PREFIX}${key}`;

  // Wrap all Redis ops in a 400ms timeout — if PDIM is congested the race
  // rejects and we fall through to the degraded in-memory limiter immediately,
  // preventing the 4–20 s PDIM HTTP timeout from stalling login/AI/billing routes.
  const REDIS_TIMEOUT_MS = 400;

  try {
    const result = await Promise.race<SlidingWindowResult>([
      (async () => {
        // PDIM does not support ZREMRANGEBYSCORE; use ZCOUNT to count only
        // in-window members (scores >= windowStart) without pruning old entries.
        const requestCount: number = await redis.zcount(
          redisKey,
          windowStart,
          "+inf",
        );

        if (requestCount >= maxRequests) {
          const oldest: string[] = await redis.zrange(redisKey, 0, 0);
          let resetAt = now + windowMs;

          if (oldest.length > 0) {
            const oldestTimestamp = parseInt(oldest[0], 10);
            resetAt = oldestTimestamp + windowMs;
          }

          return { allowed: false, remaining: 0, resetAt, total: requestCount };
        }

        const requestId = `${now}:${randomBytes(4).toString("hex")}`;
        await redis.zadd(redisKey, now, requestId);
        // fire-and-forget expire — doesn't need to block the response
        redis.expire(redisKey, Math.ceil(windowMs / 1000) + 60).catch(() => {});

        return {
          allowed: true,
          remaining: maxRequests - requestCount - 1,
          resetAt: now + windowMs,
          total: requestCount + 1,
        };
      })(),
      new Promise<SlidingWindowResult>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `[RateLimit] Redis ops timed out (${REDIS_TIMEOUT_MS}ms)`,
              ),
            ),
          REDIS_TIMEOUT_MS,
        ),
      ),
    ]);
    return result;
  } catch (error) {
    logger.warn(
      { err: error },
      "[RateLimit] Redis error — degraded mode (25% limits):",
    );
    return degradedLimiter.check(key, windowMs, maxRequests);
  }
}

function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAt: number,
): void {
  res.setHeader("X-RateLimit-Limit", limit.toString());
  res.setHeader("X-RateLimit-Remaining", Math.max(0, remaining).toString());
  res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000).toString());
}

function sendRateLimitExceeded(res: Response, resetAt: number): void {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  res.setHeader("Retry-After", Math.max(1, retryAfter).toString());
  res.status(429).json({
    error: "Too Many Requests",
    message: "Rate limit exceeded. Please try again later.",
    retryAfter: Math.max(1, retryAfter),
  });
}

function shouldSkipRateLimiting(req: Request): boolean {
  if (!isProductionEnv()) {
    return true;
  }

  const isMonitoring =
    req.path.startsWith("/api/monitoring/") ||
    req.path.startsWith("/api/system/") ||
    req.path.startsWith("/api/health") ||
    req.path === "/api/version";

  const isStaticAsset =
    req.path.startsWith("/@fs/") ||
    req.path.startsWith("/src/") ||
    req.path.startsWith("/node_modules/");

  return isMonitoring || isStaticAsset;
}

export const globalIPRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (shouldSkipRateLimiting(req)) {
    next();
    return;
  }

  const ip = getClientIP(req);
  const key = `global:ip:${ip}`;
  const { perIP } = RATE_LIMITS.global;

  const result = await slidingWindowCheck(key, perIP.windowMs, perIP.max);
  setRateLimitHeaders(res, perIP.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const globalUserRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (shouldSkipRateLimiting(req)) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `global:user:${userId}`;
  const { perUser } = RATE_LIMITS.global;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const loginRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const ip = getClientIP(req);

  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip?.startsWith("10.82.") ||
    ip?.startsWith("10.")
  ) {
    next();
    return;
  }
  const key = `auth:login:${ip}`;
  const { login } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(key, login.windowMs, login.max);
  setRateLimitHeaders(res, login.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Login rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const registerRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const ip = getClientIP(req);

  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip?.startsWith("10.82.") ||
    ip?.startsWith("10.")
  ) {
    next();
    return;
  }

  const key = `auth:register:${ip}`;
  const { register } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(key, register.windowMs, register.max);
  setRateLimitHeaders(res, register.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Registration rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const forgotPasswordRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const ip = getClientIP(req);
  const key = `auth:forgot-password:${ip}`;
  const { forgotPassword } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(
    key,
    forgotPassword.windowMs,
    forgotPassword.max,
  );
  setRateLimitHeaders(
    res,
    forgotPassword.max,
    result.remaining,
    result.resetAt,
  );

  if (!result.allowed) {
    logger.warn(`Forgot password rate limit exceeded for IP: ${ip}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const twoFactorRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const ip = getClientIP(req);
  const userId = getUserId(req);
  const key = userId ? `auth:2fa:${userId}:${ip}` : `auth:2fa:${ip}`;
  const { twoFactor } = RATE_LIMITS.auth;

  const result = await slidingWindowCheck(
    key,
    twoFactor.windowMs,
    twoFactor.max,
  );
  setRateLimitHeaders(res, twoFactor.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(
      `2FA rate limit exceeded for ${userId ? `user ${userId}` : `IP ${ip}`}`,
    );
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const billingRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `billing:user:${userId}`;
  const { perUser } = RATE_LIMITS.billing;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Billing rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const uploadRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `uploads:user:${userId}`;
  const { perUser } = RATE_LIMITS.uploads;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Upload rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const aiRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `ai:user:${userId}`;
  const { perUser } = RATE_LIMITS.ai;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`AI rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const payoutsRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `payouts:user:${userId}`;
  const { perUser } = RATE_LIMITS.payouts;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`Payout rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export const kycRateLimiter: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!isProductionEnv()) {
    next();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    next();
    return;
  }

  const key = `kyc:user:${userId}`;
  const { perUser } = RATE_LIMITS.kyc;

  const result = await slidingWindowCheck(key, perUser.windowMs, perUser.max);
  setRateLimitHeaders(res, perUser.max, result.remaining, result.resetAt);

  if (!result.allowed) {
    logger.warn(`KYC rate limit exceeded for user: ${userId}`);
    sendRateLimitExceeded(res, result.resetAt);
    return;
  }

  next();
};

export async function getRateLimitStatus(
  type: "ip" | "user" | "login" | "register" | "forgot-password" | "upload",
  identifier: string,
): Promise<{ remaining: number; resetAt: number; total: number } | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  let key: string;
  let config: { windowMs: number; max: number };

  switch (type) {
    case "ip":
      key = `global:ip:${identifier}`;
      config = RATE_LIMITS.global.perIP;
      break;
    case "user":
      key = `global:user:${identifier}`;
      config = RATE_LIMITS.global.perUser;
      break;
    case "login":
      key = `auth:login:${identifier}`;
      config = RATE_LIMITS.auth.login;
      break;
    case "register":
      key = `auth:register:${identifier}`;
      config = RATE_LIMITS.auth.register;
      break;
    case "forgot-password":
      key = `auth:forgot-password:${identifier}`;
      config = RATE_LIMITS.auth.forgotPassword;
      break;
    case "upload":
      key = `uploads:user:${identifier}`;
      config = RATE_LIMITS.uploads.perUser;
      break;
    default:
      return null;
  }

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;

    const count: number = await redis.zcount(redisKey, windowStart, "+inf");

    return {
      remaining: Math.max(0, config.max - count),
      resetAt: now + config.windowMs,
      total: count,
    };
  } catch (error) {
    logger.warn({ err: error }, "Error getting rate limit status:");
    return null;
  }
}

export async function resetRateLimit(
  type: "ip" | "user" | "login" | "register" | "forgot-password" | "upload",
  identifier: string,
): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;

  let key: string;

  switch (type) {
    case "ip":
      key = `global:ip:${identifier}`;
      break;
    case "user":
      key = `global:user:${identifier}`;
      break;
    case "login":
      key = `auth:login:${identifier}`;
      break;
    case "register":
      key = `auth:register:${identifier}`;
      break;
    case "forgot-password":
      key = `auth:forgot-password:${identifier}`;
      break;
    case "upload":
      key = `uploads:user:${identifier}`;
      break;
    default:
      return false;
  }

  try {
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;
    await redis.del(redisKey);
    return true;
  } catch (error) {
    logger.warn({ err: error }, "Error resetting rate limit:");
    return false;
  }
}
