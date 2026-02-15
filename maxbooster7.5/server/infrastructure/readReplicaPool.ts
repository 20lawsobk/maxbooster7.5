import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from '../logger.js';

interface ReplicaConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  weight?: number;
}

interface ReadReplicaPoolConfig {
  primary: PoolConfig;
  replicas: ReplicaConfig[];
  maxPoolSize: number;
  idleTimeout: number;
  connectionTimeout: number;
}

class ReadReplicaPool {
  private static instance: ReadReplicaPool;
  private primaryPool: Pool;
  private replicaPools: Pool[] = [];
  private replicaWeights: number[] = [];
  private totalWeight: number = 0;
  private currentReplicaIndex: number = 0;
  private healthyReplicas: Set<number> = new Set();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor(config: ReadReplicaPoolConfig) {
    this.primaryPool = new Pool({
      ...config.primary,
      max: config.maxPoolSize,
      idleTimeoutMillis: config.idleTimeout,
      connectionTimeoutMillis: config.connectionTimeout,
    });

    this.primaryPool.on('error', (err) => {
      logger.error('Primary pool error:', err);
    });

    for (let i = 0; i < config.replicas.length; i++) {
      const replica = config.replicas[i];
      const pool = new Pool({
        host: replica.host,
        port: replica.port,
        database: replica.database,
        user: replica.user,
        password: replica.password,
        max: Math.floor(config.maxPoolSize / config.replicas.length),
        idleTimeoutMillis: config.idleTimeout,
        connectionTimeoutMillis: config.connectionTimeout,
      });

      pool.on('error', (err) => {
        logger.error(`Replica ${i} pool error:`, err);
        this.healthyReplicas.delete(i);
      });

      this.replicaPools.push(pool);
      const weight = replica.weight || 1;
      this.replicaWeights.push(weight);
      this.totalWeight += weight;
      this.healthyReplicas.add(i);
    }

    this.startHealthChecks();
    logger.info(`Read replica pool initialized with ${config.replicas.length} replicas`);
  }

  static getInstance(): ReadReplicaPool {
    if (!ReadReplicaPool.instance) {
      const config = ReadReplicaPool.buildConfigFromEnv();
      ReadReplicaPool.instance = new ReadReplicaPool(config);
    }
    return ReadReplicaPool.instance;
  }

  static initializeWithConfig(config: ReadReplicaPoolConfig): ReadReplicaPool {
    if (!ReadReplicaPool.instance) {
      ReadReplicaPool.instance = new ReadReplicaPool(config);
    }
    return ReadReplicaPool.instance;
  }

  private static buildConfigFromEnv(): ReadReplicaPoolConfig {
    const primaryUrl = process.env.DATABASE_URL || '';
    const replicaUrls = (process.env.DATABASE_REPLICA_URLS || '').split(',').filter(Boolean);

    const parseUrl = (url: string): PoolConfig => {
      try {
        const parsed = new URL(url);
        return {
          host: parsed.hostname,
          port: parseInt(parsed.port) || 5432,
          database: parsed.pathname.slice(1),
          user: parsed.username,
          password: parsed.password,
          ssl: parsed.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false,
        };
      } catch {
        return { connectionString: url };
      }
    };

    const replicas: ReplicaConfig[] = replicaUrls.map((url, index) => {
      const config = parseUrl(url);
      return {
        host: config.host || 'localhost',
        port: (config.port as number) || 5432,
        database: config.database || 'postgres',
        user: config.user || 'postgres',
        password: config.password || '',
        weight: 1,
      };
    });

    return {
      primary: parseUrl(primaryUrl),
      replicas,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '20'),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
    };
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (let i = 0; i < this.replicaPools.length; i++) {
        try {
          const client = await this.replicaPools[i].connect();
          await client.query('SELECT 1');
          client.release();
          this.healthyReplicas.add(i);
        } catch (error) {
          logger.warn(`Replica ${i} health check failed:`, error);
          this.healthyReplicas.delete(i);
        }
      }
    }, 30000);
  }

  private selectReplica(): Pool | null {
    if (this.healthyReplicas.size === 0) {
      return null;
    }

    const healthyIndices = Array.from(this.healthyReplicas);
    let healthyWeight = 0;
    for (const index of healthyIndices) {
      healthyWeight += this.replicaWeights[index];
    }

    let random = Math.random() * healthyWeight;
    for (const index of healthyIndices) {
      random -= this.replicaWeights[index];
      if (random <= 0) {
        return this.replicaPools[index];
      }
    }

    return this.replicaPools[healthyIndices[0]];
  }

  async query(text: string, params?: any[], preferReplica: boolean = false): Promise<any> {
    const isReadQuery = this.isReadOnlyQuery(text);
    
    if (isReadQuery && preferReplica && this.replicaPools.length > 0) {
      const replicaPool = this.selectReplica();
      if (replicaPool) {
        try {
          return await replicaPool.query(text, params);
        } catch (error) {
          logger.warn('Replica query failed, falling back to primary:', error);
        }
      }
    }

    return await this.primaryPool.query(text, params);
  }

  private isReadOnlyQuery(text: string): boolean {
    const normalized = text.trim().toUpperCase();
    return normalized.startsWith('SELECT') || 
           normalized.startsWith('WITH') ||
           normalized.startsWith('EXPLAIN');
  }

  async getPrimaryClient(): Promise<PoolClient> {
    return await this.primaryPool.connect();
  }

  async getReplicaClient(): Promise<PoolClient | null> {
    const replicaPool = this.selectReplica();
    if (replicaPool) {
      return await replicaPool.connect();
    }
    return null;
  }

  getStatus(): {
    primary: { totalCount: number; idleCount: number; waitingCount: number };
    replicas: Array<{ index: number; healthy: boolean; totalCount: number; idleCount: number }>;
  } {
    return {
      primary: {
        totalCount: this.primaryPool.totalCount,
        idleCount: this.primaryPool.idleCount,
        waitingCount: this.primaryPool.waitingCount,
      },
      replicas: this.replicaPools.map((pool, index) => ({
        index,
        healthy: this.healthyReplicas.has(index),
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
      })),
    };
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    await this.primaryPool.end();
    for (const pool of this.replicaPools) {
      await pool.end();
    }
    
    logger.info('Read replica pool shut down');
  }
}

export const readReplicaPool = {
  getInstance: () => ReadReplicaPool.getInstance(),
  initialize: (config: ReadReplicaPoolConfig) => ReadReplicaPool.initializeWithConfig(config),
};

export { ReadReplicaPool, ReadReplicaPoolConfig, ReplicaConfig };
