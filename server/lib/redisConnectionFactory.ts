import { getBoosterStateClient, isBoosterStateHealthy, shutdownBoosterState } from './boosterStateClient.js';
import { logger } from '../logger.js';
import Redis from 'ioredis';
import { config } from '../config/defaults.js';

export type RedisClientType = any;

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<any> {
  // Production: Use real Redis (ioredis)
  if (config.redis.url) {
    if (!redisClient) {
      redisClient = new Redis(config.redis.url, {
        maxRetriesPerRequest: config.redis.maxRetries,
        retryStrategy: (times) => Math.min(times * config.redis.retryDelay, 2000),
      });
      redisClient.on('error', (err) => logger.error('Redis error:', err));
    }
    return redisClient;
  }

  // Fallback: Use BoosterState (KV store)
  try {
    return await getBoosterStateClient();
  } catch (error: unknown) {
    logger.warn('⚠️ BoosterState not available, falling back to in-memory operation');
    return null;
  }
}

export async function createRedisClient(): Promise<any> {
  if (config.redis.url) {
    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: config.redis.maxRetries,
      retryStrategy: (times) => Math.min(times * config.redis.retryDelay, 2000),
    });
    client.on('error', (err) => logger.error('Redis error (new client):', err));
    return client;
  }
  return getRedisClient();
}

export async function isRedisHealthy(): Promise<boolean> {
  if (config.redis.url && redisClient) {
    return redisClient.status === 'ready';
  }
  return await isBoosterStateHealthy();
}

export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  return await shutdownBoosterState();
}
