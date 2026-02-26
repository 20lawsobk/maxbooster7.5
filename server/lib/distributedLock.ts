import { getRedisClient } from './redisClient.js';
import { logger } from '../logger.js';

/**
 * Distributed Lock Service using Redis
 * 
 * Provides atomic locks across cluster nodes to ensure only one node 
 * executes a specific task at a time.
 */

/**
 * Acquire a lock
 * @param lockName Name of the lock
 * @param ttlSeconds Time-to-live in seconds
 * @returns Lock token (string) if acquired, null otherwise
 */
export async function acquireLock(lockName: string, ttlSeconds: number): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) {
    logger.warn(`[Lock] Redis unavailable, skipping lock: ${lockName}`);
    return 'fallback-token';
  }

  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const key = `lock:${lockName}`;

  try {
    // SET key value EX ttl NX
    const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  } catch (err) {
    logger.error(`[Lock] Failed to acquire lock ${lockName}:`, err);
    return null;
  }
}

/**
 * Release a lock only if the token matches
 * @param lockName Name of the lock
 * @param token The token received when acquiring the lock
 */
export async function releaseLock(lockName: string, token: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis || token === 'fallback-token') return;

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
