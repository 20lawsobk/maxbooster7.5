import { getRedisClient } from './redisClient.js';
import { logger } from '../logger.js';
import { randomBytes } from 'crypto';

const isProduction = () =>
  process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

/**
 * Distributed Lock Service using Redis
 *
 * Provides atomic locks across cluster nodes to ensure only one node
 * executes a specific task at a time.
 *
 * Failure policy:
 *   Production: fail-closed — Redis unavailable → return null → job is skipped.
 *   Development: fail-open  — Redis unavailable → proceed without lock (safe on single node).
 */

/**
 * Acquire a lock.
 * @returns Lock token if acquired, null otherwise (including when lock is held by another node).
 */
export async function acquireLock(lockName: string, ttlSeconds: number): Promise<string | null> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    // Redis not configured
  }

  if (!redis) {
    if (isProduction()) {
      logger.error(`[Lock] Redis unavailable in production — skipping lock-protected job: ${lockName}. Configure REDIS_URL to enable distributed coordination.`);
      return null;
    }
    logger.warn(`[Lock] Redis unavailable (dev) — proceeding without lock: ${lockName}`);
    return 'dev-no-redis';
  }

  const token = randomBytes(16).toString('hex');
  const key = `lock:${lockName}`;

  try {
    const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  } catch (err) {
    logger.error(`[Lock] Failed to acquire lock ${lockName}:`, err);
    if (isProduction()) return null;
    return 'dev-error-fallback';
  }
}

/**
 * Release a lock only if the token matches (Lua-script atomic release).
 */
export async function releaseLock(lockName: string, token: string): Promise<void> {
  if (token === 'dev-no-redis' || token === 'dev-error-fallback') return;

  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    return;
  }
  if (!redis) return;

  const key = `lock:${lockName}`;
  const lua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    await redis.eval(lua, 1, key, token);
  } catch (err) {
    logger.error(`[Lock] Failed to release lock ${lockName}:`, err);
  }
}

/**
 * Wrapper to run a function with a lock
 */
export async function withLock<T>(
  lockName: string, 
  ttlSeconds: number, 
  fn: () => Promise<T>
): Promise<T | null> {
  const token = await acquireLock(lockName, ttlSeconds);
  if (!token) return null;

  try {
    return await fn();
  } finally {
    await releaseLock(lockName, token);
  }
}
