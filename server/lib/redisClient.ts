/**
 * Redis Client Factory
 *
 * Supports two modes:
 *   Standalone: REDIS_URL is set → single ioredis instance (default)
 *   Cluster:    REDIS_CLUSTER_URLS is set (comma-separated) → ioredis.Cluster
 *
 * All application code imports getRedisClient() and receives a unified client
 * whether it's standalone or cluster — ioredis Cluster is API-compatible.
 *
 * Set allkeys-lru eviction policy automatically on connect to prevent OOM
 * under cache pressure (managed Redis providers may restrict CONFIG SET —
 * set it via your provider dashboard as a fallback).
 */

import Redis from 'ioredis';
import { logger } from '../logger.js';
import { applyIoredisCompatShim } from './redisCompat.js';

type RedisClient = Redis | InstanceType<typeof Redis.Cluster>;

let _redis: RedisClient | null = null;

const isProduction = () =>
  process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

function setEvictionPolicy(client: Redis): void {
  client.config('SET', 'maxmemory-policy', 'allkeys-lru').catch(() => {
    logger.warn('[Redis] Could not set maxmemory-policy — set allkeys-lru via your provider dashboard');
  });
}

function buildStandaloneClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL environment variable is not set');

  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 10000,
    commandTimeout: 10000,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 500, 3000);
    },
  });

  client.on('connect', () => {
    logger.info('✅ [Redis] Connected (standalone)');
    setEvictionPolicy(client);
  });
  client.on('error', (err) => logger.error('[Redis] Connection error:', err.message));
  client.on('reconnecting', () => logger.warn('[Redis] Reconnecting...'));

  applyIoredisCompatShim(client);
  return client;
}

function buildClusterClient(): InstanceType<typeof Redis.Cluster> {
  const urls = (process.env.REDIS_CLUSTER_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error('REDIS_CLUSTER_URLS is set but empty');

  const nodes = urls.map(url => {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port || '6379', 10) };
  });

  const client = new Redis.Cluster(nodes, {
    redisOptions: {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      password: new URL(urls[0]).password || undefined,
      tls: urls[0].startsWith('rediss://') ? {} : undefined,
    },
    clusterRetryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 3000);
    },
  });

  client.on('connect', () => logger.info('✅ [Redis] Connected (cluster mode)'));
  client.on('ready', () => {
    logger.info('✅ [Redis] Cluster ready');
    logger.info('[Redis] Reminder: set maxmemory-policy=allkeys-lru on all cluster nodes via your provider dashboard');
  });
  client.on('error', (err) => logger.error('[Redis] Cluster error:', err.message));
  client.on('reconnecting', () => logger.warn('[Redis] Cluster reconnecting...'));

  applyIoredisCompatShim(client);
  return client;
}

export function getRedisClient(): RedisClient {
  if (_redis) return _redis;

  const clusterUrls = process.env.REDIS_CLUSTER_URLS;
  if (clusterUrls) {
    logger.info('[Redis] Initialising in CLUSTER mode');
    _redis = buildClusterClient();
  } else {
    _redis = buildStandaloneClient();
  }

  return _redis;
}

export async function closeRedisClient(): Promise<void> {
  if (_redis) {
    await (_redis as Redis).quit().catch(() => {});
    _redis = null;
  }
}
