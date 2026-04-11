import { Worker, type Job } from 'bullmq';
import { newBullMQRedisConnection } from '../lib/redisClient.js';
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

const MEMORY_WARNING_THRESHOLD = 512 * 1024 * 1024;   // 512 MB — realistic for Replit VM
const MEMORY_CRITICAL_THRESHOLD = 768 * 1024 * 1024;  // 768 MB — triggers forced GC
let lastMemoryLog = 0;

function checkMemoryUsage(workerName: string): void {
  const now = Date.now();
  if (now - lastMemoryLog < 30000) return;
  lastMemoryLog = now;
  const { heapUsed } = process.memoryUsage();
  const heapUsedMB = Math.round(heapUsed / 1024 / 1024);
  if (heapUsed > MEMORY_CRITICAL_THRESHOLD) {
    logger.warn(`🚨 ${workerName}: CRITICAL memory usage ${heapUsedMB}MB`);
    if (global.gc) { logger.info(`🧹 Forcing GC...`); global.gc(); }
  } else if (heapUsed > MEMORY_WARNING_THRESHOLD) {
    logger.warn(`⚠️  ${workerName}: High memory ${heapUsedMB}MB`);
  }
}

function workerOpts(concurrency: number) {
  // PDIM is an HTTP-backed Redis replacement — each redis.call() inside a Lua
  // script costs ~100-300 ms over the network.  Keep concurrency low and add a
  // generous drainDelay so idle workers back off instead of hammering the Lua
  // executor with continuous moveToActive polls.
  const pdimConcurrency = Math.min(concurrency, 2);
  return {
    connection: newBullMQRedisConnection(),
    concurrency: pdimConcurrency,
    autorun: false,
    // drainDelay: idle workers wait 2 min before re-polling an empty queue.
    // Reduces idle BZPOPMIN+moveToActive Lua script executions against PDIM
    // from ~80/min (4 workers × 3s) to ~2/min (4 workers × 2 min).
    drainDelay: 120_000,
    runRetryDelay: 30_000,     // wait 30 s after any worker error before retrying
    limiter: { max: pdimConcurrency, duration: 1000 },
    // lockDuration: 10 min — lock renewal (every lockDuration/2 = 5 min) runs
    // one Lua script per renewal.  Raising from 2 min cuts renewal frequency 5×.
    lockDuration: 600_000,
    // stalledInterval: 5 min — moveStalledJobsToWait is a heavy 35-call Lua
    // script.  Raising from 30 s to 5 min reduces these executions 10× and
    // eliminates the majority of 45s script timeouts in steady state.
    stalledInterval: 300_000,
    maxStalledCount: 2,
  };
}

function startWorkerSafe(w: Worker, name: string): void {
  setImmediate(() => {
    w.run().catch(err => logger.warn({ err: err }, `[Worker] ${name} run loop failed:`));
  });
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
  w.on('failed', (job, err) => logger.warn(`❌ Audio job ${job?.id} failed: ${err.message}`));
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
  w.on('failed', (job, err) => logger.warn(`❌ CSV job ${job?.id} failed: ${err.message}`));
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
  w.on('failed', (job, err) => logger.warn(`❌ Analytics job ${job?.id} failed: ${err.message}`));
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
  w.on('failed', (job, err) => logger.warn(`❌ Email job ${job?.id} failed: ${err.message}`));
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
    logger.warn({ err: error }, '❌ Error during shutdown:');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  // EPIPE/ECONNRESET/ECONNABORTED are non-fatal stream/pipe errors (e.g. FFmpeg exits mid-render)
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ECONNABORTED') return;
  logger.warn({ err: error }, '❌ Uncaught exception:');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  const code = reason?.code;
  // Never crash the worker process on transient/stream/network errors.
  // Includes PDIM circuit-open, LuaExecutor timeout, and BullMQ non-array
  // return from PDIM — all handled automatically by the ChainFixer.
  const isNonFatal = (
    code === 'EPIPE' || code === 'ECONNRESET' || code === 'ECONNABORTED' ||
    /EPIPE|ECONNRESET|ECONNABORTED|ECONNREFUSED|socket|fetch failed|Failed to fetch|Command timed out|Connection is closed|AbortError|\[PDIM\] Circuit OPEN|\[LuaExecutor\]|erroredJobIds|PDIM.*Circuit|script timeout/i.test(msg)
  );
  if (isNonFatal) {
    logger.warn('⚠️ Non-fatal worker rejection (ignoring):', msg);
    return;
  }
  // Log but do NOT shut down — BullMQ retries handle job-level failures.
  logger.warn('❌ Unhandled rejection (workers):', msg);
});

export async function initializeWorkers(): Promise<void> {
  logger.info('🚀 BullMQ workers initializing (Redis-backed, ack + DLQ + retry)...');

  // Create all worker objects immediately (no Lua scripts yet — BullMQ defers the
  // first stalledInterval check until worker.run() is called).
  audioWorker     = createAudioWorker();
  csvWorker       = createCsvWorker();
  analyticsWorker = createAnalyticsWorker();
  emailWorker     = createEmailWorker();

  // Stagger run() calls by STAGGER_MS per worker to prevent all four workers from
  // firing their initial moveStalledJobsToWait Lua script simultaneously on startup.
  // With stalledInterval=300s the stall checks are: audio@0s, csv@5s, analytics@10s,
  // email@15s — each runs solo through the single LuaExecutor slot instead of piling up.
  const STAGGER_MS = 5_000;
  startWorkerSafe(audioWorker,     'audio');
  setTimeout(() => startWorkerSafe(csvWorker!,       'csv'),       1 * STAGGER_MS);
  setTimeout(() => startWorkerSafe(analyticsWorker!, 'analytics'), 2 * STAGGER_MS);
  setTimeout(() => startWorkerSafe(emailWorker!,     'email'),     3 * STAGGER_MS);

  logger.info('📋 Active BullMQ workers (staggered startup — 5s apart):');
  logger.info(`   - Audio     (concurrency: ${config.queue.concurrency.audio}, starts now)`);
  logger.info(`   - CSV       (concurrency: ${config.queue.concurrency.csv},       starts +5s)`);
  logger.info(`   - Analytics (concurrency: ${config.queue.concurrency.analytics}, starts +10s)`);
  logger.info(`   - Email     (concurrency: ${config.queue.concurrency.email},     starts +15s)`);

  try {
    const { initializeWeeklyInsightsCron } = await import('./weeklyInsightsCron.js');
    initializeWeeklyInsightsCron();
  } catch (error) {
    logger.warn({ err: error }, '⚠️  Could not initialize weekly insights cron:');
  }

  logger.info('⏳ BullMQ workers listening for jobs (staggered)...');
}

export async function shutdownWorkers(): Promise<void> {
  await gracefulShutdown('shutdownWorkers');
}

if (process.argv[1]?.includes('workers/index')) {
  initializeWorkers();
}
