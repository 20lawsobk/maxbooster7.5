/**
 * Redis Connection Factory (async / BoosterState-aware)
 *
 * Alternative entry-point for code that wants Redis lazily and is happy to
 * receive null when no broker is configured.  Prefers a real ioredis
 * connection (REDIS_URL) and falls back to BoosterState (the KV sidecar).
 *
 * Distinct from redisClient.ts which is synchronous and used by BullMQ.
 * Used by: queryCache, services that need optional Redis
 *
 * Exports:
 *   getRedisClient()    — async, returns ioredis|BoosterState|null
 *   createRedisClient() — always creates a fresh ioredis instance (for BullMQ)
 *   isRedisHealthy()    — boolean liveness check
 *   shutdownRedis()     — graceful shutdown for both backends
 */

import { getBoosterStateClient, isBoosterStateHealthy, shutdownBoosterState } from './boosterStateClient.js';
import { logger } from '../logger.js';
import Redis from 'ioredis';
import { config } from '../config/defaults.js';
import { applyIoredisCompatShim } from './redisCompat.js';
import { getPdimClient, isPdimConfigured } from './pdimClient.js';

export type RedisClientType = any;

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<any> {
  // Priority 1: PDIM (Pocket Dimension external server)
  if (isPdimConfigured()) {
    return getPdimClient();
  }

  // Priority 2: Real Redis via ioredis
  if (config.redis.url) {
    if (!redisClient) {
      redisClient = new Redis(config.redis.url, {
        maxRetriesPerRequest: config.redis.maxRetries,
        retryStrategy: (times) => Math.min(times * config.redis.retryDelay, 2000),
        connectTimeout: 2000,
        commandTimeout: 500,
        enableReadyCheck: false,
      });
      redisClient.on('error', (err) => logger.error('Redis error:', err));
      applyIoredisCompatShim(redisClient);
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
  if (isPdimConfigured()) {
    return getPdimClient().duplicate();
  }
  if (config.redis.url) {
    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: config.redis.maxRetries,
      retryStrategy: (times) => Math.min(times * config.redis.retryDelay, 2000),
      connectTimeout: 2000,
      commandTimeout: 500,
      enableReadyCheck: false,
    });
    client.on('error', (err) => logger.error('Redis error (new client):', err));
    applyIoredisCompatShim(client);
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
