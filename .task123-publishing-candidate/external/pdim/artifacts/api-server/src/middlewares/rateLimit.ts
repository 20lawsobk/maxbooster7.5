/**
 * RATE LIMITER — unauthenticated requests only
 *
 * Authenticated callers (any request with a Bearer token) are trusted and pass
 * through with no rate limit — they are the system's first-class clients (e.g.
 * max-booster-agent, max-booster-training) and need unrestricted throughput.
 *
 * Unauthenticated callers are keyed by IP and capped at UNAUTH_LIMIT_RPS.
 * Default is Number.MAX_SAFE_INTEGER (effectively unlimited) so no legitimate
 * caller is ever throttled.  Override via UNAUTH_LIMIT_RPS env var to apply a
 * lower cap in constrained environments.
 *
 * Set UNAUTH_LIMIT_RPS via env to tune.
 */

import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 1_000;
const UNAUTH_LIMIT = Number(
  process.env["UNAUTH_LIMIT_RPS"] ?? Number.MAX_SAFE_INTEGER,
);

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, bucket] of buckets) {
    if (bucket.windowStart < cutoff) buckets.delete(key);
  }
}, 5 * 60_000).unref();

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers["authorization"] ?? "";

  // Authenticated callers: always pass through, no limit.
  if (auth.startsWith("Bearer ")) {
    res.setHeader("X-RateLimit-Limit", "unlimited");
    res.setHeader("X-RateLimit-Remaining", "unlimited");
    next();
    return;
  }

  // Unauthenticated callers: sliding-window limit by IP.
  const key = req.ip ?? "unknown";
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    buckets.set(key, bucket);
  }

  bucket.count++;

  res.setHeader("X-RateLimit-Limit", String(UNAUTH_LIMIT));

  if (bucket.count > UNAUTH_LIMIT) {
    const retryAfterSec = Math.ceil(
      (WINDOW_MS - (now - bucket.windowStart)) / 1000,
    );
    res.setHeader("Retry-After", String(retryAfterSec));
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", String(bucket.windowStart + WINDOW_MS));
    res.status(429).json({
      error: "Too Many Requests",
      retryAfterSeconds: retryAfterSec,
      limitPerSecond: UNAUTH_LIMIT,
    });
    return;
  }

  res.setHeader("X-RateLimit-Remaining", String(UNAUTH_LIMIT - bucket.count));
  res.setHeader("X-RateLimit-Reset", String(bucket.windowStart + WINDOW_MS));
  next();
}

/** Read current rate-limit stats — used by the health monitor. */
export function getRateLimitStats(): {
  activeBuckets: number;
  unauthLimitRps: number;
} {
  return { activeBuckets: buckets.size, unauthLimitRps: UNAUTH_LIMIT };
}
