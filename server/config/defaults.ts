import { logger } from '../logger.js';
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
export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

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

  // Storage (S3/Object Storage/Replit)
  storage: {
    provider: 'local' | 's3' | 'replit';
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

/**
 * TODO: Add function documentation
 */
function parseEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * TODO: Add function documentation
 */
function parseEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * TODO: Add function documentation
 */
function parseEnvArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config: AppConfig = {
  nodeEnv: (process.env.NODE_ENV as any) || 'development',
  isReplitDeployment,
  isReplitWorkspace,
  port: parseEnvInt('PORT', 5000),

  database: {
    url: process.env.DATABASE_URL || '',
    poolSize: parseEnvInt('DB_POOL_SIZE', 20),
    maxConnections: parseEnvInt('DB_MAX_CONNECTIONS', 100),
    idleTimeout: parseEnvInt('DB_IDLE_TIMEOUT', 30000),
    connectionTimeout: parseEnvInt('DB_CONNECTION_TIMEOUT', 10000),
  },

  redis: {
    url: process.env.REDIS_URL || undefined, // Only use Redis if REDIS_URL is configured
    maxRetries: parseEnvInt('REDIS_MAX_RETRIES', 3),
    retryDelay: parseEnvInt('REDIS_RETRY_DELAY', 1000),
  },

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    maxSessions: parseEnvInt('MAX_SESSIONS', 80000000000), // 80 billion sessions
    ttl: parseEnvInt('SESSION_TTL', 86400), // 24 hours
    name: process.env.SESSION_NAME || 'maxbooster.sid',
  },

  rateLimiting: {
    windowMs: parseEnvInt('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
    maxRequests: parseEnvInt('RATE_LIMIT_MAX', 100),
    criticalMax: parseEnvInt('RATE_LIMIT_CRITICAL_MAX', 20),
  },

  upload: {
    maxFileSize: parseEnvInt('MAX_FILE_SIZE', 104857600), // 100MB
    allowedTypes: parseEnvArray('ALLOWED_FILE_TYPES', ['mp3', 'wav', 'flac', 'aiff', 'ogg']),
    useTempStorage: parseEnvBool('USE_TEMP_STORAGE', true), // Default to local for dev
  },

  storage: {
    // Auto-detect Replit storage if REPLIT_BUCKET_ID is available
    provider:
      (process.env.STORAGE_PROVIDER as 'local' | 's3' | 'replit') ||
      (process.env.REPLIT_BUCKET_ID ? 'replit' : 'local'),
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT, // For MinIO/custom S3
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    replitBucketId: process.env.REPLIT_BUCKET_ID,
  },

  queue: {
    concurrency: {
      audio: parseEnvInt('QUEUE_AUDIO_CONCURRENCY', 2),
      analytics: parseEnvInt('QUEUE_ANALYTICS_CONCURRENCY', 2),
      email: parseEnvInt('QUEUE_EMAIL_CONCURRENCY', 5),
      csv: parseEnvInt('QUEUE_CSV_CONCURRENCY', 1),
    },
    timeout: {
      audio: parseEnvInt('QUEUE_AUDIO_TIMEOUT', 120000), // 2 minutes
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
  } else if (config.storage.provider === 'replit') {
    logger.info(`   📦 Replit App Storage Bucket: ${config.storage.replitBucketId}`);
  }
  logger.info(`   Max File Size: ${(config.upload.maxFileSize / 1024 / 1024).toFixed(0)}MB`);
}
