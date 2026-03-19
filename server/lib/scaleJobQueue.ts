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
 * Critical fix: this must run BEFORE the worker starts processing so that
 * stale jobs are cleaned in bulk (1-2 Lua calls) rather than one-by-one
 * through the PDIM AIMD chain (100 jobs × 1.1 s = 110 s of PDIM saturation).
 *
 * Strategy:
 *   - If there are many (> 10) unnamed stale jobs → drain the entire waiting
 *     queue in ONE Lua call (queue.drain), then let the scheduler re-add
 *     legitimate named jobs on its next tick.  At startup, all waiting jobs
 *     are holdovers from the previous session; none are freshly scheduled.
 *   - If there are few stale jobs → remove them individually (fast, safe).
 *   - Also scans the active set for jobs that never had a processor pick them
 *     up (stalledCheck re-queues them as waiting; this sweep catches any that
 *     the stalledCheck timer hasn't fired yet).
 */
async function cleanStalledJobs(attempt = 1): Promise<void> {
  const MAX_ATTEMPTS = 5;
  try {
    const queue = getRetentionQueue();

    // Step 1 — remove stale active jobs left over from the prior session.
    //
    // At startup, ALL jobs in 'active' state have expired locks — they were
    // being processed when the previous server process died.  BullMQ's stalled
    // check moves them back to 'waiting' after stalledInterval (default 30 s),
    // which causes a flood of one-by-one job.remove() calls through the PDIM
    // AIMD chain.  queue.clean(0, 500, 'active') evicts them all in a SINGLE
    // Lua EVALSHA before the stalledCheck fires, eliminating the flood entirely.
    //
    // Safety: at t=5 s the new worker has not yet processed any jobs, so no
    // legitimately-running active jobs exist to be accidentally removed.
    try {
      await queue.clean(0, 500, 'active');
      logger.info('[Worker] Stale active-state jobs from prior session cleaned (single bulk Lua call)');
    } catch {
      // non-fatal — processor handles any stragglers that slip through
    }

    // Step 2 — identify and remove stale waiting jobs (belt-and-suspenders).
    // Use queue.drain() for large batches (single Lua call) to avoid
    // saturating the PDIM AIMD chain with N individual job.remove() calls.
    try {
      const waiting = await queue.getJobs(['waiting'], 0, 500);
      const stale   = waiting.filter(j => !j.name && !(j.data as any)?.type);
      if (stale.length > 10) {
        // Bulk drain: removes ALL waiting jobs in a single Lua EVALSHA.
        // Legitimate named jobs are re-added by the scheduler on its next tick
        // (cron is typically seconds away at startup, so no jobs are lost).
        await queue.drain();
        logger.info(`[Worker] Bulk-drained ${stale.length} stale orphan waiting job(s) from prior session (single Lua call — avoids PDIM saturation)`);
      } else if (stale.length > 0) {
        // Small count — individual removes are fine
        await Promise.allSettled(stale.map(j => j.remove()));
        logger.info(`[Worker] Purged ${stale.length} stale orphan waiting job(s) from prior session`);
      }
    } catch {
      // getJobs can timeout under LuaExecutor pressure; processor handles stragglers
    }

    // Step 3 — clean completed/failed tombstones older than 1 hour.
    // Use separate try blocks so a timeout on one state doesn't skip the other.
    try { await queue.clean(3_600_000, 100, 'completed'); } catch { /* non-fatal */ }
    try { await queue.clean(3_600_000, 100, 'failed'); } catch { /* non-fatal */ }

    logger.info('[Worker] Startup job cleanup complete');
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delay = attempt * 30_000; // 30 s, 60 s, 90 s, 120 s (faster retry)
      logger.warn(`[Worker] Job cleanup attempt ${attempt} failed — retrying in ${delay / 1000}s: ${(err as Error).message}`);
      setTimeout(() => cleanStalledJobs(attempt + 1).catch(() => {}), delay).unref();
    } else {
      logger.warn(`[Worker] Job cleanup permanently skipped after ${MAX_ATTEMPTS} attempts — processor will handle individual stale jobs`);
    }
  }
}

export function startRetentionWorker(): Worker {
  const connection = newBullMQRedisConnection();

  // Run cleanup at t=5 s — enough time for PDIM to connect, but BEFORE the
  // worker has processed more than a handful of stale jobs individually.
  // Previous 60 s delay allowed the worker to process 100+ stale unnamed jobs
  // one-by-one through the PDIM AIMD chain (each ~1.1 s), saturating PDIM for
  // 2-3 min and triggering SessionStore timeouts + 100 s dashboard responses.
  // The new bulk drain strategy (queue.drain for > 10 stale jobs) completes
  // the same cleanup in a single Lua call instead of 100+ sequential calls.
  setTimeout(() => cleanStalledJobs().catch(() => {}), 5_000).unref();

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
      // reduces overall PDIM load from stall checks (scripts run to natural
      // completion via the 50ms fast-lane; the 5 min cadence remains optimal).
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
