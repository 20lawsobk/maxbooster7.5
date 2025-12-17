/**
 * Cached Health Check System
 *
 * Consolidates and caches health check queries to reduce database load.
 * Instead of running multiple health queries every minute, this system:
 * - Runs a single batched health check query
 * - Caches results for 30-60 seconds
 * - Serves cached results to multiple consumers
 * - Reduces slow query warnings from frequent health checks
 */

import { db, pool } from '../db.js';
import { queryCache, createCacheKey } from './queryCache.js';

interface HealthCheckResult {
  database: {
    connected: boolean;
    poolSize: number;
    idleConnections: number;
    activeConnections: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  process: {
    uptime: number;
    cpuUsage: NodeJS.CpuUsage;
    memoryUsage: NodeJS.MemoryUsage;
  };
  timestamp: number;
}

/**
 * Perform comprehensive health check with caching
 */
/**
 * TODO: Add function documentation
 */
export async function getCachedHealthCheck(ttlSeconds: number = 30): Promise<HealthCheckResult> {
  const cacheKey = createCacheKey('health', 'system');

  return await queryCache.getOrCompute(
    cacheKey,
    async () => {
      // Batched health check queries
      const [dbHealth, processHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkProcessHealth(),
      ]);

      return {
        database: dbHealth,
        memory: processHealth.memory,
        process: processHealth.process,
        timestamp: Date.now(),
      };
    },
    ttlSeconds
  );
}

/**
 * Database health check
 */
/**
 * TODO: Add function documentation
 */
async function checkDatabaseHealth() {
  try {
    // Single lightweight query instead of multiple heavy queries
    await db.execute(`SELECT 1`);

    const poolStatus = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    return {
      connected: true,
      poolSize: poolStatus.totalCount,
      idleConnections: poolStatus.idleCount,
      activeConnections: poolStatus.totalCount - poolStatus.idleCount,
    };
  } catch (error: unknown) {
    return {
      connected: false,
      poolSize: 0,
      idleConnections: 0,
      activeConnections: 0,
    };
  }
}

/**
 * Process health check
 */
/**
 * TODO: Add function documentation
 */
async function checkProcessHealth() {
  const memUsage = process.memoryUsage();

  return {
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
    },
    process: {
      uptime: process.uptime(),
      cpuUsage: process.cpuUsage(),
      memoryUsage: memUsage,
    },
  };
}

/**
 * Lightweight liveness probe (no caching, always fresh)
 */
/**
 * TODO: Add function documentation
 */
export function getLivenessProbe() {
  return {
    status: 'alive',
    uptime: process.uptime(),
    timestamp: Date.now(),
  };
}

/**
 * Readiness probe with minimal caching (10s)
 */
/**
 * TODO: Add function documentation
 */
export async function getReadinessProbe(): Promise<{ ready: boolean; checks: any }> {
  const health = await getCachedHealthCheck(10); // 10 second cache

  return {
    ready: health.database.connected && health.memory.heapUsed < 1500, // < 1.5GB
    checks: {
      database: health.database.connected ? 'ok' : 'failed',
      memory: health.memory.heapUsed < 1500 ? 'ok' : 'high',
    },
  };
}
