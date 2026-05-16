import { logger } from '../logger.js';
import os from 'os';
import { env } from './env.js';

// VM Reserve auto-sizing: scale queue concurrency proportionally to available CPU cores.
// Formula: floor(cpuCount / 4) gives a whole-number multiplier:
//   4-core VM  → 1× baseline (no change from original defaults)
//   8-core VM  → 2× baseline  (audio: 12, analytics: 16, email: 32, csv: 8)
//   16-core VM → 4× baseline  (audio: 24, analytics: 32, email: 64, csv: 16)
// Capped at sensible maximums so PDIM isn't overwhelmed.
const _vmCpuCount = Math.max(1, os.cpus().length);
const _vmConcMult = Math.max(1, Math.floor(_vmCpuCount / 4));
/**
 * Centralized Configuration System
 *
 * All configuration values are loaded from environment variables with sensible defaults.
 * This enables easy scaling without code changes - just adjust env vars for each environment.
 *
 * Replit Environment Detection:
 * - REPLIT_DEPLOYMENT: Set to '1' when running in published/production environment
 * - REPLIT_DEV_DOMAIN: Available only in development (workspace), NOT in production
 * - NODE_ENV: Standard Node.js environment variable
 */

export const isReplitDeployment = process.env.REPLIT_DEPLOYMENT === '1';
export const isReplitWorkspace = !!process.env.REPLIT_DEV_DOMAIN;

// CRITICAL: NODE_ENV is NOT automatically set to 'production' on Replit Autoscale.
// REPLIT_DEPLOYMENT=1 is the authoritative production signal. Both must be checked.
export const isProduction = process.env.NODE_ENV === 'production' || isReplitDeployment;
export const isDevelopment = !isProduction;

export function getBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT_URL) {
    return `https://${process.env.REPLIT_DEPLOYMENT_URL}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
}

export interface AppConfig {
  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  isReplitDeployment: boolean;
  isReplitWorkspace: boolean;
  port: number;

  // Database
  database: {
    url: string;
    poolSize: number;
    maxConnections: number;
    idleTimeout: number;
    connectionTimeout: number;
  };

  // Redis
  redis: {
    url: string | undefined;
    maxRetries: number;
    retryDelay: number;
  };

  // Session
  session: {
    secret: string;
    maxSessions: number;
    ttl: number;
    name: string;
  };

  // Rate Limiting
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    criticalMax: number;
  };

  // Upload
  upload: {
    maxFileSize: number;
    allowedTypes: string[];
    useTempStorage: boolean; // true = local, false = S3
  };

  // Storage — PDIM-only (Pocket Dimension)
  storage: {
    provider: 'local' | 's3' | 'replit' | 'pocket-dimension';
    bucket?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    replitBucketId?: string;
  };

  // Job Queue
  queue: {
    concurrency: {
      audio: number;
      analytics: number;
      email: number;
      csv: number;
    };
    timeout: {
      audio: number;
      analytics: number;
      email: number;
      csv: number;
    };
    retries: {
      audio: number;
      analytics: number;
      email: number;
      csv: number;
    };
  };

  // Monitoring
  monitoring: {
    poolUtilizationThreshold: number;
    memoryWarningThreshold: number;
    memoryCriticalThreshold: number;
  };
}

function parseEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseEnvArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config: AppConfig = {
  nodeEnv: (process.env.NODE_ENV as Record<string, unknown>) || 'development',
  isReplitDeployment,
  isReplitWorkspace,
  port: parseEnvInt('PORT', 5000),

  database: {
    url: env.NEON_DATABASE_URL || env.DATABASE_URL || '',
    // In production each worker creates its own pool.  With the default of 20
    // connections × N workers we easily exceed Neon's connection limit (53100).
    // Scale the per-worker pool so all workers combined stay ≤ 15 connections:
    //   ceil(15 / CLUSTER_WORKERS) → 5 for 3 workers, 3 for 6 workers, etc.
    // The DB_POOL_SIZE env var always wins if set explicitly.
    // Dev uses 8 to avoid a cold-start storm (too many simultaneous new Neon
    // WebSocket connections stall each other and delay foreground requests).
    poolSize: parseEnvInt('DB_POOL_SIZE',
      isReplitDeployment
        ? Math.max(2, Math.ceil(15 / (parseInt(process.env.PDIM_CLUSTER_WORKERS || '1', 10) || 1)))
        : 8),
    maxConnections: parseEnvInt('DB_MAX_CONNECTIONS', 200),
    idleTimeout: parseEnvInt('DB_IDLE_TIMEOUT', 60000),
    // 3 s connection-checkout timeout: if the pool is momentarily exhausted by
    // background tasks, _retryQuery (2 attempts, 300 ms gap) fails within 6.3 s
    // — well under a 10 s HTTP client AbortSignal — instead of hanging 20 s.
    connectionTimeout: parseEnvInt('DB_CONNECTION_TIMEOUT', 3000),
  },

  redis: {
    url: env.REDIS_URL,
    maxRetries: 3,
    retryDelay: 1000,
  },

  boosterState: {
    port: parseEnvInt('BOOSTERSTATE_PORT', 9877), // sidecar listens here; clients route through PORT/api/boosterstate
    shards: parseEnvInt('BOOSTERSTATE_SHARDS', 16),
    dataDir: process.env.BOOSTERSTATE_DATA_DIR || './boosterstate-data',
  },

  session: {
    secret: env.SESSION_SECRET || 'dev-secret-change-in-production',
    maxSessions: parseEnvInt('MAX_SESSIONS', 80000000000), // 80 billion sessions
    ttl: parseEnvInt('SESSION_TTL', 86400), // 24 hours
    name: process.env.SESSION_NAME || 'maxbooster.sid',
  },

  rateLimiting: {
    windowMs:    parseEnvInt('RATE_LIMIT_WINDOW_MS',  60000),  // 1 minute window
    maxRequests: parseEnvInt('RATE_LIMIT_MAX',         1_200),  // 1 200 req/min per user/IP (20 req/s)
    criticalMax: parseEnvInt('RATE_LIMIT_CRITICAL_MAX',   30),  // 30 req/min for auth/payment endpoints
  },

  upload: {
    maxFileSize: parseEnvInt('MAX_FILE_SIZE', 209715200), // 200MB
    allowedTypes: parseEnvArray('ALLOWED_FILE_TYPES', ['mp3', 'wav', 'flac', 'aiff', 'ogg']),
    useTempStorage: parseEnvBool('USE_TEMP_STORAGE', true), // Default to local for dev
  },

  storage: {
    provider:
      (process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'pocket-dimension') as 'pocket-dimension' | 's3',
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    replitBucketId: process.env.REPLIT_BUCKET_ID || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
  },

  queue: {
    concurrency: {
      audio:     parseEnvInt('QUEUE_AUDIO_CONCURRENCY',     Math.min(24, 6  * _vmConcMult)),
      analytics: parseEnvInt('QUEUE_ANALYTICS_CONCURRENCY', Math.min(32, 8  * _vmConcMult)),
      email:     parseEnvInt('QUEUE_EMAIL_CONCURRENCY',     Math.min(64, 16 * _vmConcMult)),
      csv:       parseEnvInt('QUEUE_CSV_CONCURRENCY',       Math.min(16, 4  * _vmConcMult)),
    },
    timeout: {
      audio: parseEnvInt('QUEUE_AUDIO_TIMEOUT', 180000), // 3 minutes
      analytics: parseEnvInt('QUEUE_ANALYTICS_TIMEOUT', 30000), // 30 seconds
      email: parseEnvInt('QUEUE_EMAIL_TIMEOUT', 10000), // 10 seconds
      csv: parseEnvInt('QUEUE_CSV_TIMEOUT', 300000), // 5 minutes
    },
    retries: {
      audio: parseEnvInt('QUEUE_AUDIO_RETRIES', 3),
      analytics: parseEnvInt('QUEUE_ANALYTICS_RETRIES', 2),
      email: parseEnvInt('QUEUE_EMAIL_RETRIES', 5),
      csv: parseEnvInt('QUEUE_CSV_RETRIES', 1),
    },
  },

  monitoring: {
    poolUtilizationThreshold: parseEnvInt('POOL_UTILIZATION_THRESHOLD', 80),
    memoryWarningThreshold: parseEnvInt('MEMORY_WARNING_THRESHOLD', 80),
    memoryCriticalThreshold: parseEnvInt('MEMORY_CRITICAL_THRESHOLD', 90),
  },
};

// Validate critical configuration
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (config.storage.provider === 's3') {
    if (!config.storage.bucket) {
      errors.push('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    }
    if (!config.storage.accessKeyId || !config.storage.secretAccessKey) {
      // AWS SDK will try to use IAM role if not provided, so this is just a warning
      logger.warn('⚠️  AWS credentials not found in environment. Attempting to use IAM role...');
    }
  }

  if (
    config.nodeEnv === 'production' &&
    config.session.secret === 'dev-secret-change-in-production'
  ) {
    errors.push('SESSION_SECRET must be set in production');
  }

  if (isProduction && !config.redis.url) {
    logger.warn('⚠️  REDIS_URL not set in production - using in-memory session store');
    logger.warn('   Sessions will not persist across server restarts');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Log configuration on startup (sanitized)
export function logConfig(): void {
  logger.info('📋 Configuration loaded:');
  logger.info(`   Environment: ${config.nodeEnv}`);
  logger.info(`   Replit Deployment: ${isReplitDeployment ? 'YES (Published)' : 'NO (Workspace)'}`);
  logger.info(`   Production Mode: ${isProduction}`);
  logger.info(`   Port: ${config.port}`);
  logger.info(`   Database Pool: ${config.database.poolSize} connections`);
  logger.info(`   Max Sessions: ${config.session.maxSessions.toLocaleString()}`);
  logger.info(`   Rate Limit: ${config.rateLimiting.maxRequests} req/min`);
  logger.info(`   Storage: ${config.storage.provider}`);
  if (config.storage.provider === 's3') {
    logger.info(`   S3 Bucket: ${config.storage.bucket}`);
  } else if (config.storage.provider === 'pocket-dimension') {
    logger.info(`   📦 Storage: Pocket Dimension → PDIM (zero local disk)`);
  }
  logger.info(`   Max File Size: ${(config.upload.maxFileSize / 1024 / 1024).toFixed(0)}MB`);
}
