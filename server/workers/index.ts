import { Worker, type Job } from 'bullmq';
import { getRedisClient } from '../lib/redisClient.js';
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

const audioService = new AudioService();
const csvImportService = new RoyaltiesCSVImportService();
const anomalyService = new AnalyticsAnomalyService();

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  logger.info('✅ SendGrid initialized for email worker');
} else {
  logger.warn('⚠️  SendGrid API key not configured. Email worker will fail to send emails.');
}

const MEMORY_WARNING_THRESHOLD = 24 * 1024 * 1024 * 1024;
const MEMORY_CRITICAL_THRESHOLD = 28 * 1024 * 1024 * 1024;
let lastMemoryLog = 0;

function checkMemoryUsage(workerName: string): void {
  const now = Date.now();
  if (now - lastMemoryLog < 30000) return;
  lastMemoryLog = now;
  const { heapUsed } = process.memoryUsage();
  const heapUsedMB = Math.round(heapUsed / 1024 / 1024);
  if (heapUsed > MEMORY_CRITICAL_THRESHOLD) {
    logger.error(`🚨 ${workerName}: CRITICAL memory usage ${heapUsedMB}MB`);
    if (global.gc) { logger.info(`🧹 Forcing GC...`); global.gc(); }
  } else if (heapUsed > MEMORY_WARNING_THRESHOLD) {
    logger.warn(`⚠️  ${workerName}: High memory ${heapUsedMB}MB`);
  }
}

function workerOpts(concurrency: number) {
  return {
    connection: getRedisClient(),
    concurrency,
    limiter: { max: concurrency, duration: 1000 },
  };
}

let audioWorker: Worker | null = null;
let csvWorker: Worker | null = null;
let analyticsWorker: Worker | null = null;
let emailWorker: Worker | null = null;

function createAudioWorker(): Worker {
  const w = new Worker(
    'audio',
    async (job: Job) => {
      logger.info(`🎵 Audio job ${job.id} (${job.name}) starting...`);
      checkMemoryUsage('AudioWorker');
      switch (job.name) {
        case 'convert':
          return audioService.processAudioConversion(job.data as AudioConvertJobData);
        case 'mix':
          return audioService.processAudioMix(job.data as AudioMixJobData);
        case 'waveform':
          return audioService.processWaveformGeneration(job.data as AudioConvertJobData);
        default:
          throw new Error(`Unknown audio job type: ${job.name}`);
      }
    },
    workerOpts(config.queue.concurrency.audio),
  );
  w.on('completed', (job) => logger.info(`✅ Audio job ${job.id} completed`));
  w.on('failed', (job, err) => logger.error(`❌ Audio job ${job?.id} failed: ${err.message}`));
  return w;
}

function createCsvWorker(): Worker {
  const w = new Worker(
    'csv',
    async (job: Job) => {
      logger.info(`📊 CSV import job ${job.id} starting...`);
      checkMemoryUsage('CSVWorker');
      return csvImportService.processCSVImport(job.data as CSVImportJobData);
    },
    workerOpts(config.queue.concurrency.csv),
  );
  w.on('completed', (job) => logger.info(`✅ CSV job ${job.id} completed`));
  w.on('failed', (job, err) => logger.error(`❌ CSV job ${job?.id} failed: ${err.message}`));
  return w;
}

function createAnalyticsWorker(): Worker {
  const w = new Worker(
    'analytics',
    async (job: Job) => {
      logger.info(`📈 Analytics job ${job.id} (${job.data.type}) starting...`);
      checkMemoryUsage('AnalyticsWorker');
      switch (job.data.type) {
        case 'anomaly-detection':
          return anomalyService.processAnomalyDetection(job.data as AnalyticsJobData);
        default:
          throw new Error(`Unknown analytics job type: ${job.data.type}`);
      }
    },
    workerOpts(config.queue.concurrency.analytics),
  );
  w.on('completed', (job) => logger.info(`✅ Analytics job ${job.id} completed`));
  w.on('failed', (job, err) => logger.error(`❌ Analytics job ${job?.id} failed: ${err.message}`));
  return w;
}

function createEmailWorker(): Worker {
  const w = new Worker(
    'email',
    async (job: Job) => {
      const { to, subject, html, from } = job.data as EmailJobData;
      logger.info(`📧 Email job ${job.id} → ${to}`);
      checkMemoryUsage('EmailWorker');

      if (!process.env.SENDGRID_API_KEY) {
        logger.warn('⚠️  SendGrid not configured, skipping email send');
        return;
      }

      const fromEmail = from || process.env.SENDGRID_FROM_EMAIL || 'noreply@maxbooster.ai';
      await sgMail.send({ to, from: fromEmail, subject, html });
      logger.info(`✅ Email sent to ${to}`);
    },
    workerOpts(config.queue.concurrency.email),
  );
  w.on('completed', (job) => logger.info(`✅ Email job ${job.id} completed`));
  w.on('failed', (job, err) => logger.error(`❌ Email job ${job?.id} failed: ${err.message}`));
  return w;
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`\n🛑 Received ${signal}, shutting down workers...`);
  try {
    await Promise.all([
      audioWorker?.close(),
      csvWorker?.close(),
      analyticsWorker?.close(),
      emailWorker?.close(),
    ]);
    logger.info('✅ All BullMQ workers closed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  const isNonFatal = /ECONNREFUSED|ECONNRESET|socket|fetch failed|Failed to fetch/i.test(msg);
  if (isNonFatal) {
    logger.warn('⚠️ Non-fatal network error (ignoring):', msg);
    return;
  }
  logger.error('❌ Unhandled rejection:', msg);
  gracefulShutdown('unhandledRejection');
});

export async function initializeWorkers(): Promise<void> {
  logger.info('🚀 BullMQ workers initializing (Redis-backed, ack + DLQ + retry)...');

  audioWorker = createAudioWorker();
  csvWorker = createCsvWorker();
  analyticsWorker = createAnalyticsWorker();
  emailWorker = createEmailWorker();

  logger.info('📋 Active BullMQ workers:');
  logger.info(`   - Audio     (concurrency: ${config.queue.concurrency.audio})`);
  logger.info(`   - CSV       (concurrency: ${config.queue.concurrency.csv})`);
  logger.info(`   - Analytics (concurrency: ${config.queue.concurrency.analytics})`);
  logger.info(`   - Email     (concurrency: ${config.queue.concurrency.email})`);

  try {
    const { initializeWeeklyInsightsCron } = await import('./weeklyInsightsCron.js');
    initializeWeeklyInsightsCron();
  } catch (error) {
    logger.warn('⚠️  Could not initialize weekly insights cron:', error);
  }

  logger.info('⏳ BullMQ workers listening for jobs...');
}

export async function shutdownWorkers(): Promise<void> {
  await gracefulShutdown('shutdownWorkers');
}

if (process.argv[1]?.includes('workers/index')) {
  initializeWorkers();
}
