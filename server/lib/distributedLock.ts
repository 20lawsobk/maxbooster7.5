import { getRedisClient } from "./redisClient.js";
import { isPdimConfigured } from "./pdimClient.js";
import { logger } from "../logger.js";
import { randomBytes } from "crypto";

/**
 * Distributed Lock Service — PDIM-backed
 *
 * Provides atomic locks across cluster nodes via PDIM (the sole Redis backend).
 * Ensures only one node executes a specific task at a time.
 */

/**
 * Acquire a lock.
 * @returns Lock token if acquired, null if the lock is already held by another node.
 */
export async function acquireLock(
  lockName: string,
  ttlSeconds: number,
): Promise<string | null> {
  const redis = getRedisClient();
  const token = randomBytes(16).toString("hex");
  const key = `lock:${lockName}`;

  try {
    const result = await redis?.set(key, token, "EX", ttlSeconds, "NX");
    return result === "OK" ? token : null;
  } catch (err) {
    logger.warn({ err: err }, `[Lock] Failed to acquire lock ${lockName}:`);
    throw err;
  }
}

/**
 * Release a lock only if the token matches (Lua-script atomic release).
 *
 * NOTE: This uses Lua eval and will time out on PDIM. For scheduler tasks,
 * use withSchedLock() instead, which performs a non-Lua get+del release.
 */
export async function releaseLock(
  lockName: string,
  token: string,
): Promise<void> {
  const redis = getRedisClient();
  const key = `lock:${lockName}`;
  const lua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    await redis?.eval(lua, 1, key, token);
  } catch (err) {
    logger.warn({ err: err }, `[Lock] Failed to release lock ${lockName}:`);
    throw err;
  }
}

/**
 * Run a function under a distributed lock.
 * Returns null if the lock is already held by another node.
 *
 * NOTE: Uses Lua for atomic release — not suitable for PDIM-backed scheduler tasks.
 * For cron job deduplication use withSchedLock() instead.
 */
export async function withLock<T>(
  lockName: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const token = await acquireLock(lockName, ttlSeconds);
  if (!token) return null;

  try {
    return await fn();
  } finally {
    await releaseLock(lockName, token);
  }
}

// ── Scheduler distributed lock ────────────────────────────────────────────────
//
// withSchedLock() is a Lua-free distributed lock for setInterval-based cron tasks.
// It uses PDIM's SET NX EX for acquisition and a non-atomic get+del for release.
// The non-atomic release is safe because:
//   1. The lock TTL is always shorter than the interval — if the release misses,
//      the TTL auto-expires before the next interval tick.
//   2. The token comparison (get → compare → del) prevents us from deleting a
//      lock that another pod re-acquired after our TTL expired.
//
// Failure handling:
//   - PDIM not configured (single-instance mode): always executes, no lock needed
//     — there is no other pod to race against.
//   - PDIM error (acquisition itself failed): fail-closed — skip this tick rather
//     than run unlocked. Running anyway when multiple pods hit the same PDIM blip
//     simultaneously would let every pod execute the "exclusive" task at once,
//     which is a real duplicate-execution risk, not a safe degradation.

/** Number of scheduler locks currently held by this pod (for /api/system/health). */
let _heldLockCount = 0;

/**
 * Returns true if this pod is currently the scheduler leader for any task.
 * Exposed to /api/system/health as `scheduler_leader`.
 */
export function isSchedulerLeader(): boolean {
  return _heldLockCount > 0;
}

/**
 * Run a scheduled task under a distributed lock (Lua-free, PDIM-safe).
 *
 * Only one pod in the cluster will execute fn() per interval tick.
 * If the lock is held by another pod, this function returns immediately (skip).
 * The lock is released early (get+del) after fn() completes to minimise PDIM key
 * lifetime, and auto-expires via TTL if the release call fails.
 *
 * @param name      Human-readable task name (used as PDIM key suffix)
 * @param ttlSecs   Lock TTL in seconds — must be < interval period so the lock
 *                  expires before the next tick if the pod crashes.
 * @param fn        The task function to execute when this pod wins the lock.
 */
export async function withSchedLock(
  name: string,
  ttlSecs: number,
  fn: () => Promise<void>,
): Promise<void> {
  // Single-instance (no PDIM): always run — no competition between pods.
  if (!isPdimConfigured()) {
    _heldLockCount++;
    try {
      await fn();
    } catch (err) {
      logger.warn(`[SchedLock] ${name} error: ${(err as Error).message}`);
    } finally {
      _heldLockCount--;
    }
    return;
  }

  let token: string | null = null;
  try {
    token = await acquireLock(name, ttlSecs);
  } catch (err) {
    // PDIM unavailable — fail closed. We cannot tell whether another pod
    // already holds (or is about to acquire) the lock, so running here risks
    // every pod in the cluster executing this "exclusive" task at once during
    // the same PDIM blip. Skip this tick; the next interval retries the lock.
    logger.warn(
      `[SchedLock] PDIM error for ${name}, skipping this tick (fail-closed): ${(err as Error).message}`,
    );
    return;
  }

  if (!token) {
    // Another pod holds the lock — skip this tick.
    return;
  }

  _heldLockCount++;
  const lockKey = `lock:${name}`;
  try {
    await fn();
  } catch (err) {
    logger.warn(`[SchedLock] ${name} error: ${(err as Error).message}`);
  } finally {
    _heldLockCount--;
    // Non-Lua release: read current token, delete only if we still own the lock.
    // If PDIM is down, the TTL auto-expires — non-critical.
    try {
      const redis = getRedisClient();
      const current = await redis?.get(lockKey);
      if (current === token) {
        await redis?.del(lockKey);
      }
    } catch {
      // Lock will auto-expire via TTL — release failure is not critical.
    }
  }
}
