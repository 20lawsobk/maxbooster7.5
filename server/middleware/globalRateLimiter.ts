/**
 * Global rate limiter using express-rate-limit backed by a PDIM-Redis ZSET store.
 *
 * Design decision — custom store vs rate-limit-redis:
 *   rate-limit-redis v4 implements a fixed-window algorithm (INCR + EXPIRE) which
 *   is vulnerable to boundary-burst attacks: firing `limit` requests at end of
 *   window A and `limit` more at the start of window B yields 2×limit through.
 *   Our custom RedisRateLimitStore uses a ZSET sliding-window (ZCOUNT) that closes
 *   this gap.  Switching to rate-limit-redis would regress security, so we keep
 *   the custom store but use getRedisClient() (PdimRedisClient) as its backend —
 *   satisfying the PDIM-backed store requirement without losing sliding-window
 *   semantics.  The atomic EVAL primary path + ZCOUNT fallback are both PDIM-native.
 */
import rateLimit, {
  type Store,
  type Options,
  type IncrementResponse,
} from "express-rate-limit";
import type { Request, Response } from "express";
import { config } from "../config/defaults.js";
import { logger } from "../logger.js";
import { getRedisClient } from "../lib/redisClient.js";
import { SLIDING_WINDOW_LUA } from "./slidingWindowLua.js";

const RL_PREFIX = "glrl:";

interface MemEntry {
  hits: number;
  resetAt: number;
}

class RedisRateLimitStore implements Store {
  private windowMs: number;
  private maxRequests: number;
  private fallbackStore = new Map<string, MemEntry>();
  private fallbackPrunedAt = Date.now();

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.maxRequests =
      typeof options.max === "number" ? options.max : this.maxRequests;
  }

  private fallbackIncrement(key: string): IncrementResponse {
    const now = Date.now();
    if (now - this.fallbackPrunedAt > 60_000) {
      for (const [k, v] of this.fallbackStore) {
        if (now > v.resetAt) this.fallbackStore.delete(k);
      }
      this.fallbackPrunedAt = now;
    }
    const entry = this.fallbackStore.get(key);
    if (!entry || now > entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.fallbackStore.set(key, { hits: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetAt) };
  }

  async increment(key: string): Promise<IncrementResponse> {
    const rKey = `${RL_PREFIX}${key}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const entryId = `${now}:${Math.random().toString(36).slice(2, 9)}`;
    const windowExpireSecs = Math.ceil(this.windowMs / 1000) + 60;

    try {
      const redis = getRedisClient();
      // Atomic sliding-window check via EVAL — single PDIM round-trip, no race window.
      // Falls back to sequential ZSET ops if EVAL is unsupported (HTTP 400).
      const totalHits = await Promise.race([
        (async () => {
          try {
            const raw = await redis.eval(
              SLIDING_WINDOW_LUA,
              1,
              rKey,
              String(windowStart),
              String(this.maxRequests),
              String(now),
              entryId,
              String(windowExpireSecs),
            );
            // Lua returns [{isLimited: 0|1}, {remaining}]; convert to totalHits.
            // express-rate-limit blocks when totalHits > max, so a limited request
            // must produce a value STRICTLY greater than maxRequests.
            const arr = Array.isArray(raw) ? raw : [];
            const isLimited = Number(arr[0] ?? 0) === 1;
            const remaining = Number(arr[1] ?? 0);
            if (isLimited) return this.maxRequests + 1; // force the limiter to block
            return this.maxRequests - remaining;
          } catch {
            // EVAL unsupported — PDIM does not support ZREMRANGEBYSCORE, so use
            // ZCOUNT directly to count only in-window members without pruning.
            // ZCOUNT is always supported by PDIM and gives the correct count.
            const count: number = await redis.zcount(rKey, windowStart, "+inf");
            // Mirror the Lua path: do NOT record the request when already limited.
            // Avoids extending the blocking window on hot keys.
            if (count >= this.maxRequests) return this.maxRequests + 1;
            await redis.zadd(rKey, now, entryId);
            Promise.resolve(redis.expire(rKey, windowExpireSecs)).catch(
              () => {},
            );
            return count + 1;
          }
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "[GlobalRateLimit] Sliding-window ops timeout (400ms)",
                ),
              ),
            400,
          ),
        ),
      ]);
      const resetTime = new Date(now + this.windowMs);
      return { totalHits, resetTime };
    } catch {
      logger.warn(
        "[GlobalRateLimit] Redis unavailable — using in-memory fallback",
      );
      return this.fallbackIncrement(key);
    }
  }

  async decrement(key: string): Promise<void> {
    // With ZSET, undo an increment by removing the most-recently-added member
    // (highest score = most recent timestamp). ZREMRANGEBYRANK -1 -1 pops the top.
    // Single atomic command — no race window.
    const rKey = `${RL_PREFIX}${key}`;
    try {
      const redis = getRedisClient();
      await redis.zremrangebyrank(rKey, -1, -1);
    } catch {
      const entry = this.fallbackStore.get(key);
      if (entry && entry.hits > 0) entry.hits--;
    }
  }

  async resetKey(key: string): Promise<void> {
    this.fallbackStore.delete(key);
    try {
      const redis = getRedisClient();
      await redis.del(`${RL_PREFIX}${key}`);
    } catch {
      // Redis unavailable — in-memory fallback already cleared above
    }
  }
}

const globalStore = new RedisRateLimitStore(
  config.rateLimiting.windowMs,
  config.rateLimiting.maxRequests,
);
const criticalStore = new RedisRateLimitStore(
  config.rateLimiting.windowMs,
  config.rateLimiting.criticalMax,
);

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  store: globalStore,
  message: {
    error: "Too many requests",
    message:
      "You have exceeded the request limit. Please slow down and try again later.",
    retryAfter: `${Math.ceil(config.rateLimiting.windowMs / 1000)} seconds`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req: Request) => {
    const isDevelopment =
      process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT;
    const isMonitoringEndpoint =
      req.path.startsWith("/api/monitoring/") ||
      req.path.startsWith("/api/system/");
    const isStaticAsset =
      req.path.startsWith("/@fs/") ||
      req.path.startsWith("/src/") ||
      req.path.startsWith("/node_modules/") ||
      req.path.startsWith("/@vite/") ||
      req.path.startsWith("/@react-refresh") ||
      req.path.startsWith("/@replit/");
    const isLocalhost =
      req.ip === "127.0.0.1" ||
      req.ip === "::1" ||
      req.ip === "::ffff:127.0.0.1" ||
      (typeof req.ip === "string" && req.ip.startsWith("10."));
    const isSessionMaintenance =
      req.path === "/api/auth/refresh-token" ||
      req.path === "/api/auth/me" ||
      req.path === "/api/auth/heartbeat";

    if (isMonitoringEndpoint) return true;
    if (isDevelopment) return true;
    if (isLocalhost) return true;
    if (isSessionMaintenance) return true;
    return isStaticAsset;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`⚠️ Global rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "Too many requests",
      message:
        "You have exceeded the request limit. Please slow down and try again later.",
      retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000),
    });
  },
});

export const criticalEndpointLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.criticalMax,
  store: criticalStore,
  message: {
    error: "Too many requests to critical endpoint",
    message: "This endpoint is rate-limited. Please try again later.",
  },
  validate: { trustProxy: false },
  skip: (req: Request) => {
    return (
      req.ip === "127.0.0.1" ||
      req.ip === "::1" ||
      req.ip === "::ffff:127.0.0.1" ||
      (typeof req.ip === "string" && req.ip.startsWith("10."))
    );
  },
});
