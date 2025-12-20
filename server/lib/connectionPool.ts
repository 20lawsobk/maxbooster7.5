import { Pool, PoolConfig } from 'pg';
import { logger } from '../logger.js';

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

  constructor() {
    this.config = this.getOptimalConfig();
    this.pool = new Pool(this.config);
    this.setupEventHandlers();
    this.startMonitoring();
  }

  private getOptimalConfig(): PoolConfig {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const baseConfig: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      
      max: isProduction ? 100 : 20,
      min: isProduction ? 10 : 2,
      
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      
      allowExitOnIdle: !isProduction,
    };

    if (process.env.DATABASE_URL?.includes('neon') || process.env.DATABASE_URL?.includes('pooler')) {
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
    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    this.pool.on('acquire', () => {
    });

    this.pool.on('release', () => {
    });

    this.pool.on('error', (err) => {
      this.errorCount++;
      logger.error('Pool error:', err.message);
    });

    this.pool.on('remove', () => {
      logger.debug('Connection removed from pool');
    });
  }

  private startMonitoring(): void {
    setInterval(() => {
      const stats = this.getStats();
      
      if (stats.utilizationPercent > 80) {
        logger.warn(`High pool utilization: ${stats.utilizationPercent.toFixed(1)}%`);
      }
      
      if (stats.waitingClients > 10) {
        logger.warn(`High waiting queue: ${stats.waitingClients} clients waiting`);
      }
    }, 30000);
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    this.queryCount++;

    try {
      const result = await this.pool.query(text, params);
      
      const duration = Date.now() - start;
      this.updateAvgQueryTime(duration);
      
      if (duration > 1000) {
        logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}...`);
      }

      return result.rows;
    } catch (error: any) {
      this.errorCount++;
      throw error;
    }
  }

  async getClient() {
    return this.pool.connect();
  }

  async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getStats(): PoolStats {
    const total = this.pool.totalCount;
    const idle = this.pool.idleCount;
    const waiting = this.pool.waitingCount;
    const max = this.config.max || 10;

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
      totalQueries: this.queryCount,
      totalErrors: this.errorCount,
      errorRate: this.queryCount > 0 ? this.errorCount / this.queryCount : 0,
      avgQueryTimeMs: this.avgQueryTime,
    };
  }

  private updateAvgQueryTime(newTime: number): void {
    this.avgQueryTime = (this.avgQueryTime * 0.9) + (newTime * 0.1);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    
    try {
      await this.pool.query('SELECT 1');
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
  }

  async resize(newMax: number): Promise<void> {
    logger.info(`Resizing pool from ${this.config.max} to ${newMax} connections`);
    
    await this.pool.end();
    
    this.config.max = newMax;
    this.pool = new Pool(this.config);
    this.setupEventHandlers();
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down connection pool...');
    await this.pool.end();
    logger.info('Connection pool shut down');
  }
}

export const connectionPool = new OptimizedConnectionPool();

export async function withConnection<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await connectionPool.getClient();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  return connectionPool.transaction(fn);
}

export const getPoolHealth = () => ({
  pool: connectionPool.getStats(),
  queries: connectionPool.getQueryStats(),
});

process.on('SIGTERM', async () => {
  await connectionPool.shutdown();
});

process.on('SIGINT', async () => {
  await connectionPool.shutdown();
});
