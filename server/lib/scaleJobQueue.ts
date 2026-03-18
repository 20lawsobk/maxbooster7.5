/**
 * Scale Job Queue — BullMQ-backed retention and maintenance worker
 *
 * Manages background jobs that run on a schedule across all server replicas.
 * Uses Redis (via ioredis) as the BullMQ broker so jobs are distributed
 * evenly and not duplicated when multiple nodes are running.
 *
 * Supported job types:
 *   health-score-batch   — Paginated computation of customer health scores
 *   dunning-process      — Process pending dunning/payment-retry steps
 *   re-engagement-batch  — Daily re-engagement email sweep
 *   feature-event-flush  — Drain the in-memory feature-event buffer to the DB
 *
 * Concurrency is capped via BULLMQ_CONCURRENCY (default 5) to prevent DB
 * connection pool exhaustion.  Failed jobs are retained for 7 days (up to
 * 100 entries) so they can be inspected and re-queued.
 */

import { Queue, Worker, Job } from 'bullmq';
import { getRedisClient, newBullMQRedisConnection } from './redisClient.js';
import { logger } from '../logger.js';
import { customerHealthScoreService } from '../services/customerHealthScoreService.js';
import { dunningService } from '../services/dunningService.js';
import { reEngagementService } from '../services/reEngagementService.js';
import { flushFeatureEvents } from '../services/featureEventBuffer.js';

export const RETENTION_QUEUE = 'retention-jobs';

/**
 * How many jobs the worker runs in parallel.
 * Capped to 3 to prevent DB connection storms during queue drain.
 * Override with BULLMQ_CONCURRENCY env var.
 */
const WORKER_CONCURRENCY = parseInt(process.env.BULLMQ_CONCURRENCY ?? '3', 10);

/**
 * Job persistence + retry policy.
 * Completed jobs kept for 24 h (observability). Failed kept for 7 d (100 most recent) so they can be retried.
 */
const JOB_DEFAULTS = {
  removeOnComplete: true,
  removeOnFail: { count: 10 },
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

let _queue: Queue | null = null;

export function getRetentionQueue(): Queue {
  if (_queue) return _queue;

  const connection = newBullMQRedisConnection();
  _queue = new Queue(RETENTION_QUEUE, {
    connection,
    defaultJobOptions: JOB_DEFAULTS,
  });
  return _queue;
}

/**
 * Purge stale jobs left over from previous server sessions.
 *
 * Stale "waiting" jobs (no name, no data.type) are also cleaned up by the
 * worker processor itself via job.remove(), so this function is a belt-and-
 * suspenders sweep, not a critical path.  It retries with back-off so that
 * a congested LuaExecutor at startup never causes a permanent skip.
 */
async function cleanStalledJobs(attempt = 1): Promise<void> {
  const MAX_ATTEMPTS = 5;
  try {
    const queue = getRetentionQueue();

    // Step 1 — remove stale waiting jobs (belt-and-suspenders; processor also
    // handles these via job.remove() so failures here are non-critical).
    try {
      const waiting = await queue.getJobs(['waiting'], 0, 200);
      const stale = waiting.filter(j => !j.name && !(j.data as any)?.type);
      if (stale.length > 0) {
        await Promise.allSettled(stale.map(j => j.remove()));
        logger.info(`[Worker] Purged ${stale.length} stale orphan waiting job(s) from prior session`);
      }
    } catch {
      // getJobs can timeout under LuaExecutor pressure; processor handles stragglers
    }

    // Step 2 — clean completed/failed tombstones older than 1 hour.
    // Use separate try blocks so a timeout on one state doesn't skip the other.
    try { await queue.clean(3_600_000, 100, 'completed'); } catch { /* non-fatal */ }
    try { await queue.clean(3_600_000, 100, 'failed'); } catch { /* non-fatal */ }

    logger.info('[Worker] Startup job cleanup complete');
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delay = attempt * 60_000; // 60 s, 120 s, 180 s, 240 s
      logger.warn(`[Worker] Job cleanup attempt ${attempt} failed — retrying in ${delay / 1000}s: ${(err as Error).message}`);
      setTimeout(() => cleanStalledJobs(attempt + 1).catch(() => {}), delay).unref();
    } else {
      logger.warn(`[Worker] Job cleanup permanently skipped after ${MAX_ATTEMPTS} attempts — processor will handle individual stale jobs`);
    }
  }
}

export function startRetentionWorker(): Worker {
  const connection = newBullMQRedisConnection();

  // Delay cleanup by 60 s so LuaExecutor/PDIM has fully warmed up before we
  // issue bulk queue operations that would compete with boot traffic.
  setTimeout(() => cleanStalledJobs().catch(() => {}), 60_000).unref();

  const worker = new Worker(
    RETENTION_QUEUE,
    async (job: Job) => {
      const jobName = job.name ?? (job.data?.type as string | undefined);
      if (!jobName) {
        logger.warn(`[Worker] Removing stale/unnamed job id=${job.id} — leftover from prior session`);
        // Remove the job outright so BullMQ never tries moveToFinished on it.
        // A bare `return` would still call moveToFinished, which fails when the
        // LuaExecutor lock has expired and produces a noisy "Missing lock" error.
        try { await job.remove(); } catch { /* job already gone — ignore */ }
        return;
      }
      logger.info(`[Worker] Processing job ${jobName} id=${job.id}`);

      try {
        switch (jobName) {
          case 'health-score-batch': {
            const { cursor = 0, batchSize = 100 } = job.data;
            const nextCursor = await customerHealthScoreService.batchComputePaged(cursor, batchSize);
            if (nextCursor !== null) {
              await getRetentionQueue().add('health-score-batch', { cursor: nextCursor, batchSize });
            }
            break;
          }

          case 'dunning-process': {
            const { limit = 50 } = job.data;
            const processed = await dunningService.processPendingStepsPaged(limit);
            logger.info(`[Worker] Dunning processed ${processed} records`);
            break;
          }

          case 're-engagement-batch': {
            await reEngagementService.runDailyCheck();
            break;
          }

          case 'feature-event-flush': {
            const MAX_FLUSH_ITERATIONS = 20;
            let totalFlushed = 0;
            let batch: number;
            let iterations = 0;
            do {
              batch = await flushFeatureEvents();
              totalFlushed += batch;
              iterations++;
            } while (batch > 0 && iterations < MAX_FLUSH_ITERATIONS);
            if (batch > 0) {
              await getRetentionQueue().add('feature-event-flush', {});
              logger.info(`[Worker] Feature event buffer still has items — re-queued next flush`);
            }
            logger.info(`[Worker] Feature events flushed to DB: ${totalFlushed} in ${iterations} batches`);
            break;
          }

          default:
            logger.warn(`[Worker] Unknown job name: ${jobName}`);
        }
      } catch (err) {
        logger.error(`[Worker] Job ${jobName} failed:`, err);
        throw err;
      }
    },
    {
      connection,
      concurrency: 1,
      runRetryDelay: 30000,
      autorun: false,
      drainDelay: 120_000,
      // stalledInterval: 5 min — moveStalledJobsToWait runs ~35 PDIM redis.call()s;
      // raising from 60 s to 5 min reduces these Lua script executions 5× and
      // prevents the majority of 45s script timeouts from the retention worker.
      stalledInterval: 300_000,
      maxStalledCount: 1,
      // lockDuration: 10 min — lock renewal fires every lockDuration/2 = 5 min.
      // Raising from 60 s cuts lock-renewal Lua scripts from 1/min to 1/5min.
      lockDuration: 600_000,
      limiter: {
        max: 1,
        duration: 5_000,
      },
    }
  );

  setImmediate(() => {
    worker.run().catch(err => {
      logger.error('[Worker] Failed to start run loop:', err);
    });
  });

  worker.on('completed', job => {
    // Stale jobs are removed inside the processor — their name is undefined.
    // Suppress the completed log for those (already logged as WARN above).
    if (job.name) logger.info(`[Worker] ✅ ${job.id} (${job.name}) done`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Worker] ❌ ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  worker.on('error', err => {
    const msg = err.message ?? '';
    // "Missing lock for job X. moveToFinished" is a BullMQ-internal race that
    // fires when a slow LuaExecutor round-trip causes the job lock to expire
    // before the Lua moveToFinished script runs.  It is fully self-healing —
    // BullMQ re-queues the job automatically — so log it at WARN, not ERROR.
    if (msg.includes('Missing lock for job') || msg.includes('moveToFinished')) {
      logger.warn(`[Worker] Recoverable BullMQ lock race (self-healing): ${msg}`);
    } else {
      logger.error('[Worker] Worker error:', msg);
    }
  });

  return worker;
}
