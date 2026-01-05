/**
 * Worker Process Entry Point
 * 
 * This file creates worker processes for processing background jobs from all queues.
 * Workers should be run as separate processes to enable horizontal scaling.
 * 
 * Run with: node --loader tsx server/workers/index.ts
 */

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config/defaults.js';
import { AudioService } from '../services/audioService.js';
import { RoyaltiesCSVImportService } from '../services/royaltiesCSVImportService.js';
import { AnalyticsAnomalyService } from '../services/analyticsAnomalyService.js';
import sgMail from '@sendgrid/mail';
import { logger } from '../logger.js';
import type {
  AudioConvertJobData,
  AudioMixJobData,
  AudioJobResult,
  CSVImportJobData,
  CSVImportResult,
  AnalyticsJobData,
  EmailJobData,
} from '../services/queueService.js';

const isDevelopment = config.nodeEnv === 'development';
let hasLoggedWarning = false;

// Initialize services
const audioService = new AudioService();
const csvImportService = new RoyaltiesCSVImportService();
const anomalyService = new AnalyticsAnomalyService();

// Initialize SendGrid for email worker
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  logger.info('✅ SendGrid initialized for email worker');
} else {
  logger.warn('⚠️  SendGrid API key not configured. Email worker will fail to send emails.');
}

// Create Redis connection for BullMQ with graceful error handling
function createRedisConnection(): Redis | null {
  const redisUrl = config.redis.url;
  
  // Don't create connection if no Redis URL is configured
  if (!redisUrl) {
    logger.warn('⚠️  Workers: No REDIS_URL configured, queue workers will not function');
    return null;
  }
  
  const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // BullMQ requirement
    retryStrategy: (times) => {
      if (times > config.redis.maxRetries) {
        return null; // Stop retrying
      }
      return Math.min(times * config.redis.retryDelay, 3000);
    },
    lazyConnect: true,
    showFriendlyErrorStack: false, // Suppress internal ioredis error logging
  });

  redisClient.on('error', (err) => {
    if (isDevelopment) {
      if (!hasLoggedWarning) {
        logger.warn(`⚠️  Workers: Redis unavailable (${err.message}), workers will use fallback behavior`);
        hasLoggedWarning = true;
      }
    } else {
      logger.error(`❌ Workers Redis Error:`, err.message);
    }
  });

  redisClient.on('connect', () => {
    if (isDevelopment) {
      logger.info(`✅ Workers Redis connected`);
    }
  });

  // Don't call connect() - let it connect lazily on first use
  // This prevents promise rejection errors from being logged
  
  return redisClient;
}

const connection = createRedisConnection();

// ==================== MEMORY MONITORING ====================
const MEMORY_WARNING_THRESHOLD = 400 * 1024 * 1024; // 400MB warning threshold
const MEMORY_CRITICAL_THRESHOLD = 600 * 1024 * 1024; // 600MB critical threshold
let lastMemoryLog = 0;

function checkMemoryUsage(workerName: string): void {
  const now = Date.now();
  // Only log memory every 30 seconds to avoid log spam
  if (now - lastMemoryLog < 30000) return;
  lastMemoryLog = now;

  const memUsage = process.memoryUsage();
  const heapUsed = memUsage.heapUsed;
  const heapUsedMB = Math.round(heapUsed / 1024 / 1024);

  if (heapUsed > MEMORY_CRITICAL_THRESHOLD) {
    logger.error(`🚨 ${workerName}: CRITICAL memory usage ${heapUsedMB}MB - approaching limit`);
    // Force garbage collection if available
    if (global.gc) {
      logger.info(`🧹 ${workerName}: Forcing garbage collection...`);
      global.gc();
    }
  } else if (heapUsed > MEMORY_WARNING_THRESHOLD) {
    logger.warn(`⚠️  ${workerName}: High memory usage ${heapUsedMB}MB`);
  }
}

// Periodic memory monitoring for all workers
const memoryMonitorInterval = setInterval(() => {
  checkMemoryUsage('Workers');
}, 60000); // Check every minute

// ==================== WORKER OPTIONS WITH RESOURCE LIMITS ====================
const workerOptions = {
  connection,
  // Limit job processing time to prevent runaway jobs
  lockDuration: 300000, // 5 minutes max lock time
  stalledInterval: 30000, // Check for stalled jobs every 30s
};

// ==================== AUDIO WORKER ====================
const audioWorker = new Worker<AudioConvertJobData | AudioMixJobData, AudioJobResult>(
  'audio',
  async (job: Job<AudioConvertJobData | AudioMixJobData, AudioJobResult>) => {
    logger.info(`🎵 Processing ${job.name} job ${job.id}...`);
    checkMemoryUsage('AudioWorker');
    
    try {
      switch (job.name) {
        case 'convert':
          return await audioService.processAudioConversion(job.data as AudioConvertJobData);
        
        case 'mix':
          return await audioService.processAudioMix(job.data as AudioMixJobData);
        
        case 'waveform':
          return await audioService.processWaveformGeneration(job.data as AudioConvertJobData);
        
        default:
          throw new Error(`Unknown audio job type: ${job.name}`);
      }
    } catch (error: unknown) {
      logger.error(`❌ Audio job ${job.id} failed:`, error.message);
      throw error;
    }
  },
  {
    ...workerOptions,
    concurrency: config.queue.concurrency.audio,
  }
);

audioWorker.on('active', (job: Job) => {
  logger.info(`▶️  Audio job ${job.id} (${job.name}) is now active`);
});

audioWorker.on('completed', (job: Job, result: AudioJobResult) => {
  logger.info(`✅ Audio job ${job.id} completed - Output: ${result.storageKey}`);
});

audioWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error(`❌ Audio job ${job?.id} failed:`, err.message);
});

audioWorker.on('progress', (job: Job, progress: number | object) => {
  logger.info(`📊 Audio job ${job.id} progress:`, progress);
});

// ==================== CSV WORKER ====================
const csvWorker = new Worker<CSVImportJobData, CSVImportResult>(
  'csv',
  async (job: Job<CSVImportJobData, CSVImportResult>) => {
    logger.info(`📊 Processing CSV import job ${job.id}...`);
    checkMemoryUsage('CSVWorker');
    
    try {
      return await csvImportService.processCSVImport(job.data);
    } catch (error: unknown) {
      logger.error(`❌ CSV job ${job.id} failed:`, error.message);
      throw error;
    }
  },
  {
    ...workerOptions,
    concurrency: config.queue.concurrency.csv,
  }
);

csvWorker.on('active', (job: Job) => {
  logger.info(`▶️  CSV job ${job.id} is now active - User: ${job.data.userId}`);
});

csvWorker.on('completed', (job: Job, result: CSVImportResult) => {
  logger.info(`✅ CSV job ${job.id} completed - Processed: ${result.rowsProcessed} rows in ${result.duration}ms`);
});

csvWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error(`❌ CSV job ${job?.id} failed:`, err.message);
});

csvWorker.on('progress', (job: Job, progress: number | object) => {
  logger.info(`📊 CSV job ${job.id} progress:`, progress);
});

// ==================== ANALYTICS WORKER ====================
const analyticsWorker = new Worker<AnalyticsJobData, any>(
  'analytics',
  async (job: Job<AnalyticsJobData, any>) => {
    logger.info(`📈 Processing analytics job ${job.id} (${job.data.type})...`);
    checkMemoryUsage('AnalyticsWorker');
    
    try {
      switch (job.data.type) {
        case 'anomaly-detection':
          return await anomalyService.processAnomalyDetection(job.data);
        
        default:
          throw new Error(`Unknown analytics job type: ${job.data.type}`);
      }
    } catch (error: unknown) {
      logger.error(`❌ Analytics job ${job.id} failed:`, error.message);
      throw error;
    }
  },
  {
    ...workerOptions,
    concurrency: config.queue.concurrency.analytics,
  }
);

analyticsWorker.on('active', (job: Job) => {
  logger.info(`▶️  Analytics job ${job.id} (${job.data.type}) is now active`);
});

analyticsWorker.on('completed', (job: Job, result: unknown) => {
  logger.info(`✅ Analytics job ${job.id} completed`, result);
});

analyticsWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error(`❌ Analytics job ${job?.id} failed:`, err.message);
});

analyticsWorker.on('progress', (job: Job, progress: number | object) => {
  logger.info(`📊 Analytics job ${job.id} progress:`, progress);
});

// ==================== EMAIL WORKER ====================
const emailWorker = new Worker<EmailJobData, void>(
  'email',
  async (job: Job<EmailJobData, void>) => {
    logger.info(`📧 Processing email job ${job.id} - To: ${job.data.to}...`);
    checkMemoryUsage('EmailWorker');
    
    try {
      const { to, subject, html, from } = job.data;
      
      if (!process.env.SENDGRID_API_KEY) {
        logger.warn('⚠️  SendGrid not configured, skipping email send');
        return;
      }
      
      const fromEmail = from || process.env.SENDGRID_FROM_EMAIL || 'noreply@maxbooster.ai';
      
      await sgMail.send({
        to,
        from: fromEmail,
        subject,
        html,
      });
      
      logger.info(`✅ Email sent to ${to}`);
    } catch (error: unknown) {
      logger.error(`❌ Email job ${job.id} failed:`, error.message);
      throw error;
    }
  },
  {
    ...workerOptions,
    concurrency: config.queue.concurrency.email,
  }
);

emailWorker.on('active', (job: Job) => {
  logger.info(`▶️  Email job ${job.id} is now active - To: ${job.data.to}`);
});

emailWorker.on('completed', (job: Job) => {
  logger.info(`✅ Email job ${job.id} completed - Sent to: ${job.data.to}`);
});

emailWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error(`❌ Email job ${job?.id} failed:`, err.message);
});

emailWorker.on('progress', (job: Job, progress: number | object) => {
  logger.info(`📊 Email job ${job.id} progress:`, progress);
});

// ==================== GRACEFUL SHUTDOWN ====================
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`\n🛑 Received ${signal}, shutting down workers gracefully...`);
  
  try {
    // Clear memory monitor interval to prevent leaks
    clearInterval(memoryMonitorInterval);
    logger.info('✅ Memory monitor stopped');
    
    await Promise.all([
      audioWorker.close(),
      csvWorker.close(),
      analyticsWorker.close(),
      emailWorker.close(),
    ]);
    
    logger.info('✅ All workers closed successfully');
    
    // Close Redis connection
    await connection.quit();
    logger.info('✅ Redis connection closed');
    
    process.exit(0);
  } catch (error: unknown) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any, promise) => {
  // Log the actual error for debugging
  const reasonStr = String(reason);
  const errorMessage = reason?.message || reason?.toString?.() || reasonStr;
  
  // Don't crash on temporary connection errors - let Redis reconnect
  const isConnectionError = errorMessage?.includes('ECONNREFUSED') ||
                            errorMessage?.includes('ECONNRESET') ||
                            errorMessage?.includes('Connection') ||
                            errorMessage?.includes('socket') ||
                            reason?.code === 'ECONNREFUSED' ||
                            reason?.code === 'ECONNRESET';
  
  if (isConnectionError) {
    logger.warn('⚠️ Connection error (will retry):', errorMessage);
    return; // Don't shutdown for connection errors
  }
  
  // Log full error details for debugging
  logger.error('❌ Unhandled rejection:', errorMessage);
  logger.error('   Reason type:', typeof reason);
  logger.error('   Reason:', JSON.stringify(reason, Object.getOwnPropertyNames(reason || {})));
  gracefulShutdown('unhandledRejection');
});

// ==================== INITIALIZATION FUNCTION ====================
// Can be imported and called from main server in development mode
export async function initializeWorkers(): Promise<void> {
  logger.info('🚀 Background workers initialized');
  logger.info('📋 Active workers:');
  logger.info(`   - Audio (concurrency: ${config.queue.concurrency.audio})`);
  logger.info(`   - CSV Import (concurrency: ${config.queue.concurrency.csv})`);
  logger.info(`   - Analytics (concurrency: ${config.queue.concurrency.analytics})`);
  logger.info(`   - Email (concurrency: ${config.queue.concurrency.email})`);
  
  try {
    const { initializeWeeklyInsightsCron } = await import('./weeklyInsightsCron.js');
    initializeWeeklyInsightsCron();
  } catch (error) {
    logger.warn('⚠️  Could not initialize weekly insights cron:', error);
  }
  
  logger.info('⏳ Waiting for jobs...');
}

// ==================== STARTUP ====================
// Only run startup logs if this is the main module
if (process.argv[1]?.includes('workers/index')) {
  logger.info('🚀 Background workers started successfully');
  logger.info('📋 Active workers:');
  logger.info(`   - Audio (concurrency: ${config.queue.concurrency.audio})`);
  logger.info(`   - CSV Import (concurrency: ${config.queue.concurrency.csv})`);
  logger.info(`   - Analytics (concurrency: ${config.queue.concurrency.analytics})`);
  logger.info(`   - Email (concurrency: ${config.queue.concurrency.email})`);
  logger.info('🔌 Connected to Redis:', config.redis.url);
  logger.info('\n⏳ Waiting for jobs...\n');
}
