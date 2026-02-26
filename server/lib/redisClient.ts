import Redis from 'ioredis';
import { logger } from '../logger.js';

let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL environment variable is not set');

  _redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 3000);
    },
  });

  _redis.on('connect', () => {
    logger.info('✅ [Redis] Connected');
    _redis!.config('SET', 'maxmemory-policy', 'allkeys-lru').catch(() => {
      logger.warn('[Redis] Could not set maxmemory-policy (managed Redis may restrict CONFIG SET — set it via provider dashboard)');
    });
  });
  _redis.on('error', (err) => logger.error('[Redis] Connection error:', err.message));
  _redis.on('reconnecting', () => logger.warn('[Redis] Reconnecting...'));

  return _redis;
}

export async function closeRedisClient(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
