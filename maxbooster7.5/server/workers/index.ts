import { getBoosterStateClient } from '../lib/boosterStateClient.js';
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

const MEMORY_WARNING_THRESHOLD = 400 * 1024 * 1024;
const MEMORY_CRITICAL_THRESHOLD = 600 * 1024 * 1024;
let lastMemoryLog = 0;

function checkMemoryUsage(workerName: string): void {
  const now = Date.now();
  if (now - lastMemoryLog < 30000) return;
  lastMemoryLog = now;

  const memUsage = process.memoryUsage();
  const heapUsed = memUsage.heapUsed;
  const heapUsedMB = Math.round(heapUsed / 1024 / 1024);

  if (heapUsed > MEMORY_CRITICAL_THRESHOLD) {
    logger.error(`🚨 ${workerName}: CRITICAL memory usage ${heapUsedMB}MB - approaching limit`);
    if (global.gc) {
      logger.info(`🧹 ${workerName}: Forcing garbage collection...`);
      global.gc();
    }
  } else if (heapUsed > MEMORY_WARNING_THRESHOLD) {
    logger.warn(`⚠️  ${workerName}: High memory usage ${heapUsedMB}MB`);
  }
}

const memoryMonitorInterval = setInterval(() => {
  checkMemoryUsage('Workers');
}, 60000);

class BoosterWorker {
  private queueName: string;
  private processor: (job: { id: string; name: string; data: any }) => Promise<any>;
  private concurrency: number;
  private pollInterval: number;
  private activeJobs: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(
    queueName: string,
    processor: (job: { id: string; name: string; data: any }) => Promise<any>,
    options?: { concurrency?: number; pollInterval?: number }
  ) {
    this.queueName = queueName;
    this.processor = processor;
    this.concurrency = options?.concurrency || 1;
    this.pollInterval = options?.pollInterval || 2000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.intervalId = setInterval(async () => {
      if (this.activeJobs >= this.concurrency) return;

      try {
        const client = await getBoosterStateClient();
        if (!client) return;

        const item = await client.queuePop(this.queueName);
        if (!item) return;

        this.activeJobs++;

        try {
          const parsed = JSON.parse(item.data);
          const job = {
            id: item.id,
            name: parsed.name || 'unknown',
            data: parsed.data || parsed,
          };

          logger.info(`▶️  ${this.queueName} job ${job.id} (${job.name}) is now active`);
          const result = await this.processor(job);
          logger.info(`✅ ${this.queueName} job ${job.id} completed`);
        } catch (error: any) {
          logger.error(`❌ ${this.queueName} job ${item.id} failed:`, error?.message || error);
        } finally {
          this.activeJobs--;
        }
      } catch (error: any) {
        logger.warn(`⚠️  ${this.queueName} worker poll error:`, error?.message || error);
      }
    }, this.pollInterval);
  }

  async close(): Promise<void> {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

const audioWorker = new BoosterWorker(
  'audio',
  async (job) => {
    logger.info(`🎵 Processing ${job.name} job ${job.id}...`);
    checkMemoryUsage('AudioWorker');

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
  },
  { concurrency: config.queue.concurrency.audio, pollInterval: 2000 }
);

const csvWorker = new BoosterWorker(
  'csv',
  async (job) => {
    logger.info(`📊 Processing CSV import job ${job.id}...`);
    checkMemoryUsage('CSVWorker');
    return await csvImportService.processCSVImport(job.data as CSVImportJobData);
  },
  { concurrency: config.queue.concurrency.csv, pollInterval: 2000 }
);

const analyticsWorker = new BoosterWorker(
  'analytics',
  async (job) => {
    logger.info(`📈 Processing analytics job ${job.id} (${job.data.type})...`);
    checkMemoryUsage('AnalyticsWorker');

    switch (job.data.type) {
      case 'anomaly-detection':
        return await anomalyService.processAnomalyDetection(job.data as AnalyticsJobData);
      default:
        throw new Error(`Unknown analytics job type: ${job.data.type}`);
    }
  },
  { concurrency: config.queue.concurrency.analytics, pollInterval: 2000 }
);

const emailWorker = new BoosterWorker(
  'email',
  async (job) => {
    logger.info(`📧 Processing email job ${job.id} - To: ${job.data.to}...`);
    checkMemoryUsage('EmailWorker');

    const { to, subject, html, from } = job.data as EmailJobData;

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
  },
  { concurrency: config.queue.concurrency.email, pollInterval: 2000 }
);

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`\n🛑 Received ${signal}, shutting down workers gracefully...`);

  try {
    clearInterval(memoryMonitorInterval);
    logger.info('✅ Memory monitor stopped');

    await Promise.all([
      audioWorker.close(),
      csvWorker.close(),
      analyticsWorker.close(),
      emailWorker.close(),
    ]);

    logger.info('✅ All workers closed successfully');
    process.exit(0);
  } catch (error: unknown) {
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

process.on('unhandledRejection', (reason: any, promise) => {
  const reasonStr = String(reason);
  const errorMessage = reason?.message || reason?.toString?.() || reasonStr;

  const isConnectionError = errorMessage?.includes('ECONNREFUSED') ||
                            errorMessage?.includes('ECONNRESET') ||
                            errorMessage?.includes('Connection') ||
                            errorMessage?.includes('socket') ||
                            reason?.code === 'ECONNREFUSED' ||
                            reason?.code === 'ECONNRESET';

  if (isConnectionError) {
    logger.warn('⚠️ Connection error (will retry):', errorMessage);
    return;
  }

  logger.error('❌ Unhandled rejection:', errorMessage);
  gracefulShutdown('unhandledRejection');
});

export async function initializeWorkers(): Promise<void> {
  logger.info('🚀 Background workers initializing (boosterstate-backed)...');

  audioWorker.start();
  csvWorker.start();
  analyticsWorker.start();
  emailWorker.start();

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

export async function shutdownWorkers(): Promise<void> {
  await gracefulShutdown('shutdownWorkers');
}

if (process.argv[1]?.includes('workers/index')) {
  initializeWorkers();
}
