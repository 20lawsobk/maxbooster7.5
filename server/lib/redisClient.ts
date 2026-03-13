/**
 * Redis Client Factory
 *
 * Supports two modes:
 *   Standalone: REDIS_URL is set → single ioredis instance (default)
 *   Cluster:    REDIS_CLUSTER_URLS is set with 2+ comma-separated URLs → ioredis.Cluster
 *
 * IMPORTANT: If REDIS_CLUSTER_URLS contains only a single URL (same as REDIS_URL),
 * we fall back to standalone mode automatically. ioredis.Cluster requires a true
 * Redis Cluster (6+ nodes). Connecting a Cluster client to a single-node Redis
 * causes endless reconnects and session store timeouts.
 *
 * All application code imports getRedisClient() and receives a unified client.
 *
 * NOTE: allkeys-lru eviction policy must be set manually via your Redis
 * provider dashboard. Replit's managed Redis does not permit CONFIG SET.
 */

import Redis from 'ioredis';
import { logger } from '../logger.js';
import { applyIoredisCompatShim } from './redisCompat.js';
import { getPdimClient, isPdimConfigured } from './pdimClient.js';

type RedisClient = Redis | InstanceType<typeof Redis.Cluster>;

let _redis: RedisClient | null = null;

function buildStandaloneClient(urlOverride?: string): Redis {
  const url = urlOverride || process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL environment variable is not set');

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 5000,
    // 500ms fail-fast: under heavy load Redis commands queue up; a 2s timeout
    // causes a 2s-deep backlog that stalls every request. 500ms fails fast so
    // the in-memory fallback takes over without blocking the event loop, while
    // still allowing enough time for remote Redis TLS handshake on cold start.
    commandTimeout: 500,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 300, 2000);
    },
  });

  client.on('connect', () => {
    logger.info('✅ [Redis] Connected (standalone)');
    logger.info('[Redis] Reminder: ensure allkeys-lru eviction policy is set via your Redis provider dashboard');
  });
  client.on('error', (err) => logger.error('[Redis] Connection error:', err.message));
  client.on('reconnecting', () => logger.warn('[Redis] Reconnecting...'));

  applyIoredisCompatShim(client);
  return client;
}

function buildClusterClient(urls: string[]): InstanceType<typeof Redis.Cluster> {
  const nodes = urls.map(url => {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port || '6379', 10) };
  });

  const client = new Redis.Cluster(nodes, {
    redisOptions: {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      commandTimeout: 500,
      connectTimeout: 5000,
      password: new URL(urls[0]).password || undefined,
      tls: urls[0].startsWith('rediss://') ? {} : undefined,
    },
    clusterRetryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
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

/**
 * Returns a fresh ioredis instance configured for BullMQ.
 * BullMQ requires maxRetriesPerRequest=null on the connection it uses for
 * blocking commands (BRPOPLPUSH / BLMOVE). This must NOT be the shared
 * singleton — each call returns an independent connection so BullMQ can
 * .duplicate() it safely for its own blocking sub-connection.
 */
export function newBullMQRedisConnection(): Redis {
  // BullMQ requires Lua scripting (EVAL) for all atomic queue operations.
  // PDIM does not support EVAL ("ERR unknown command 'EVAL'"), so BullMQ
  // MUST always use a real ioredis TCP connection — never PDIM.
  const url = (() => {
    const clusterUrls = (process.env.REDIS_CLUSTER_URLS || '')
      .split(',').map(u => u.trim()).filter(Boolean);
    return clusterUrls.length >= 1 ? clusterUrls[0] : process.env.REDIS_URL;
  })();
  if (!url) throw new Error('REDIS_URL environment variable is not set for BullMQ');

  if (isPdimConfigured()) {
    logger.info('[Redis/BullMQ] PDIM active for app ops — BullMQ using direct ioredis (EVAL required)');
  }

  const conn = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 5000,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 300, 2000);
    },
  });
  conn.on('error', (err) => logger.error('[Redis/BullMQ] Connection error:', err.message));
  applyIoredisCompatShim(conn);
  return conn;
}

export function getRedisClient(): RedisClient {
  if (_redis) return _redis;

  // Prefer PDIM (external Pocket Dimension / Redis replacement) when configured
  if (isPdimConfigured()) {
    logger.info('[Redis] PDIM_HTTP_EXEC_URL detected — routing all Redis operations through PDIM');
    _redis = getPdimClient() as unknown as RedisClient;
    return _redis;
  }

  const clusterUrls = (process.env.REDIS_CLUSTER_URLS || '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  if (clusterUrls.length > 1) {
    logger.info(`[Redis] Initialising in CLUSTER mode (${clusterUrls.length} nodes)`);
    _redis = buildClusterClient(clusterUrls);
  } else if (clusterUrls.length === 1) {
    logger.info('[Redis] REDIS_CLUSTER_URLS has a single URL — using standalone mode (single node cannot form a cluster)');
    _redis = buildStandaloneClient(clusterUrls[0]);
  } else {
    logger.info('[Redis] Initialising in STANDALONE mode');
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
