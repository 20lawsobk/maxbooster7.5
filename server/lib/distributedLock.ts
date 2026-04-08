import { getRedisClient } from './redisClient.js';
import { logger } from '../logger.js';
import { randomBytes } from 'crypto';

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
export async function acquireLock(lockName: string, ttlSeconds: number): Promise<string | null> {
  const redis = getRedisClient();
  const token = randomBytes(16).toString('hex');
  const key = `lock:${lockName}`;

  try {
    const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  } catch (err) {
    logger.warn(`[Lock] Failed to acquire lock ${lockName}:`, err);
    throw err;
  }
}

/**
 * Release a lock only if the token matches (Lua-script atomic release).
 */
export async function releaseLock(lockName: string, token: string): Promise<void> {
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
    await redis.eval(lua, 1, key, token);
  } catch (err) {
    logger.warn(`[Lock] Failed to release lock ${lockName}:`, err);
    throw err;
  }
}

/**
 * Run a function under a distributed lock.
 * Returns null if the lock is already held by another node.
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
