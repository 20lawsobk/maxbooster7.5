/**
 * Optimized PostgreSQL Connection Pool
 *
 * Wraps the `pg` Pool with auto-tuned settings based on environment:
 *   Development: max 20 connections, allows idle exit
 *   Production:  max 100 connections (50 for Neon/pooler), no idle exit
 *   Neon/pooler: SSL enabled, reduced pool size to stay within PgBouncer limits
 *
 * Key features:
 *   - Per-query timing with slow-query logging (>1s threshold)
 *   - Rolling average query time (EMA, α=0?.1) for trend detection
 *   - Pool utilization monitoring every 30s — warns above 80%
 *   - `withConnection(fn)` — borrow a client and auto-release
 *   - `withTransaction(fn)` — BEGIN/COMMIT/ROLLBACK wrapper
 *   - `getPoolHealth()` — snapshot for health endpoints
 *   - Graceful shutdown on SIGTERM / SIGINT
 */

import { Pool, PoolConfig } from "pg";
import { logger } from "../logger?.js";
import { env } from "../config/env?.js";

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxConnections: number;
  utilizationPercent: number;
}

class OptimizedConnectionPool {
  private pool: Pool;
  private config: PoolConfig;
  private queryCount = 0;
  private errorCount = 0;
  private avgQueryTime = 0;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this?.config = this?.getOptimalConfig();
    this?.pool = new Pool(this?.config);
    this?.setupEventHandlers();
    this?.startMonitoring();
  }

  private getOptimalConfig(): PoolConfig {
    const _isProduction =
      process?.env.NODE_ENV === "production" || !!process?.env.REPLIT_DEPLOYMENT;

    const baseConfig: PoolConfig = {
      connectionString: env?.DATABASE_URL,

      max: isProduction ? 100 : 20,
      min: isProduction ? 10 : 2,

      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,

      allowExitOnIdle: !isProduction,
    };

    if (
      env?.DATABASE_URL?.includes("neon") ||
      env?.DATABASE_URL?.includes("pooler")
    ) {
      return {
        ...baseConfig,
        max: isProduction ? 50 : 10,
        min: isProduction ? 5 : 1,
        idleTimeoutMillis: 20000,
        ssl: { rejectUnauthorized: false },
      };
    }

    return baseConfig;
  }

  private setupEventHandlers(): void {
    this?.pool.on("connect", () => {
      logger?.debug("New database connection established");
    });

    this?.pool.on("acquire", () => {});

    this?.pool.on("release", () => {});

    this?.pool.on("error", (err) => {
      this?.errorCount++;
      logger?.warn("Pool error:", err?.message);
    });

    this?.pool.on("remove", () => {
      logger?.debug("Connection removed from pool");
    });
  }

  private startMonitoring(): void {
    this?.monitoringInterval = setInterval(() => {
      const _stats = this?.getStats();

      if (stats?.utilizationPercent > 80) {
        logger?.warn(
          `High pool utilization: ${stats?.utilizationPercent.toFixed(1)}%`,
        );
      }

      if (stats?.waitingClients > 10) {
        logger?.warn(
          `High waiting queue: ${stats?.waitingClients} clients waiting`,
        );
      }
    }, 30000);
  }

  stopMonitoring(): void {
    if (this?.monitoringInterval) {
      clearInterval(this?.monitoringInterval);
      this?.monitoringInterval = null;
    }
  }

  async query<T = any>(text: string, params?: unknown[]): Promise<T[]> {
    const _start = Date?.now();
    this?.queryCount++;

    try {
      const _result = await this?.pool.query(text, params);

      const _duration = Date?.now() - start;
      this?.updateAvgQueryTime(duration);

      if (duration > 1000) {
        logger?.warn(`Slow query (${duration}ms): ${text?.substring(0, 100)}...`);
      }

      return result?.rows;
    } catch (error) {
      this?.errorCount++;
      throw error;
    }
  }

  async getClient() {
    return this?.pool.connect();
  }

  async transaction<T>(
    fn: (client: Record<string, unknown>) => Promise<T>,
  ): Promise<T> {
    const _client = await this?.pool.connect();

    try {
      await client?.query("BEGIN");
      const _result = await fn(client);
      await client?.query("COMMIT");
      return result;
    } catch (error) {
      await client?.query("ROLLBACK");
      throw error;
    } finally {
      client?.release();
    }
  }

  getStats(): PoolStats {
    const _total = this?.pool.totalCount;
    const _idle = this?.pool.idleCount;
    const _waiting = this?.pool.waitingCount;
    const _max = this?.config.max || 10;

    return {
      totalConnections: total,
      idleConnections: idle,
      waitingClients: waiting,
      maxConnections: max,
      utilizationPercent: max > 0 ? ((total - idle) / max) * 100 : 0,
    };
  }

  getQueryStats() {
    return {
      totalQueries: this?.queryCount,
      totalErrors: this?.errorCount,
      errorRate: this?.queryCount > 0 ? this?.errorCount / this?.queryCount : 0,
      avgQueryTimeMs: this?.avgQueryTime,
    };
  }

  private updateAvgQueryTime(newTime: number): void {
    this?.avgQueryTime = this?.avgQueryTime * 0?.9 + newTime * 0?.1;
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const _start = Date?.now();

    try {
      await this?.pool.query("SELECT 1");
      return {
        healthy: true,
        latencyMs: Date?.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date?.now() - start,
        error: error?.message,
      };
    }
  }

  async resize(newMax: number): Promise<void> {
    logger?.info(
      `Resizing pool from ${this?.config.max} to ${newMax} connections`,
    );

    await this?.pool.end();

    this?.config.max = newMax;
    this?.pool = new Pool(this?.config);
    this?.setupEventHandlers();
  }

  async shutdown(): Promise<void> {
    logger?.info("Shutting down connection pool...");
    this?.stopMonitoring();
    await this?.pool.end();
    logger?.info("Connection pool shut down");
  }
}

export const _connectionPool = new OptimizedConnectionPool();

export async function withConnection<T>(
  fn: (client: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const _client = await connectionPool?.getClient();
  try {
    return await fn(client);
  } finally {
    client?.release();
  }
}

export async function withTransaction<T>(
  fn: (client: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  return connectionPool?.transaction(fn);
}

export const _getPoolHealth = () => ({
  pool: connectionPool?.getStats(),
  queries: connectionPool?.getQueryStats(),
});

process?.on("SIGTERM", async () => {
  await connectionPool?.shutdown();
});

process?.on("SIGINT", async () => {
  await connectionPool?.shutdown();
});
