/**
 * Single import surface for every transient-state system in the app
 * ("the self-containment layer"). This module does NOT reimplement or
 * replace any of these systems — it re-exports the same singleton
 * instances/functions the app already uses, so callers can import them
 * from one place. Internal behavior of each system (revocation, L1
 * caching, sliding-window limits, DLQ/retry, etc.) is untouched.
 *
 * Deliberately excluded: re-instantiating anything. Session creation
 * (`createSessionStore`) and queue registration (`initializeWorkers`) are
 * one-shot boot operations owned by server/index.ts — importing them here
 * only re-exports the function, it does not call it again.
 *
 * If you need general-purpose ad-hoc TTL caching in new code, use
 * `cacheGet`/`cacheSet` from this module (backed by PdimBackend). For
 * anything with existing specialized behavior below, keep using its own
 * API — that behavior exists for real reasons documented at each source.
 */

// ── Core storage substrate ──────────────────────────────────────────────
export { getPdimClient, isPdimConfigured } from "../lib/pdimClient.js";
export { getRedisClient, newBullMQRedisConnection } from "../lib/redisClient.js";

// ── General-purpose typed cache (new code should default to this) ──────
export { memory, MemoryLayer } from "./MemoryLayer.js";
export { cacheGet, cacheSet, cacheDelete } from "./Cache.js";
export { PdimBackend } from "./PdimBackend.js";
export type { MemoryBackend, MemoryKey } from "./types.js";

// ── Sessions (PDIM + L1 cache + PG fallback + revocation) ──────────────
export {
  createSessionStore,
  getSessionConfig,
  revokeUserSessions,
} from "../middleware/sessionConfig.js";

// ── API response cache (invalidation log, per-user bust) ───────────────
export {
  apiCache,
  cacheMiddleware,
  invalidateCacheOnMutation,
} from "../middleware/apiCache.js";

// ── DB query cache ───────────────────────────────────────────────────────
export { queryCache, createCacheKey } from "../lib/queryCache.js";

// ── Rate limiters (AIMD-aware sliding window) ───────────────────────────
export {
  globalScalableRateLimiter,
  apiRateLimiter,
  aiRateLimiter as scalableAiRateLimiter,
  authRateLimiter,
  createScalableRateLimiter,
  adaptiveRateLimiter,
} from "../middleware/scalableRateLimiter.js";
export {
  globalIPRateLimiter,
  globalUserRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  aiRateLimiter,
  getRateLimitStatus,
  resetRateLimit,
} from "../middleware/rateLimiter.js";

// ── Background job queues (BullMQ: ack, DLQ, retry) ─────────────────────
export { initializeWorkers, shutdownWorkers } from "../workers/index.js";
