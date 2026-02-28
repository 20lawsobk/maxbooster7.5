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
import { getRedisClient } from './redisClient.js';
import { logger } from '../logger.js';
import { customerHealthScoreService } from '../services/customerHealthScoreService.js';
import { dunningService } from '../services/dunningService.js';
import { reEngagementService } from '../services/reEngagementService.js';
import { flushFeatureEvents } from '../services/featureEventBuffer.js';

export const RETENTION_QUEUE = 'retention-jobs';

/**
 * How many jobs the worker runs in parallel.
 * Capped to 5 to prevent DB connection storms during queue drain.
 * Override with BULLMQ_CONCURRENCY env var.
 */
const WORKER_CONCURRENCY = parseInt(process.env.BULLMQ_CONCURRENCY ?? '5', 10);

/**
 * Job persistence + retry policy.
 * Completed jobs kept for 24 h (observability). Failed kept for 7 d (100 most recent) so they can be retried.
 */
const JOB_DEFAULTS = {
  removeOnComplete: { age: 86_400 },
  removeOnFail: { count: 100 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
};

let _queue: Queue | null = null;

export function getRetentionQueue(): Queue {
  if (_queue) return _queue;

  const connection = getRedisClient();
  _queue = new Queue(RETENTION_QUEUE, {
    connection,
    defaultJobOptions: JOB_DEFAULTS,
  });
  return _queue;
}

export function startRetentionWorker(): Worker {
  const connection = getRedisClient();

  const worker = new Worker(
    RETENTION_QUEUE,
    async (job: Job) => {
      logger.info(`[Worker] Processing job ${job.name} id=${job.id}`);

      try {
        switch (job.name) {
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
            logger.warn(`[Worker] Unknown job name: ${job.name}`);
        }
      } catch (err) {
        logger.error(`[Worker] Job ${job.name} failed:`, err);
        throw err;
      }
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
      limiter: {
        max: WORKER_CONCURRENCY,
        duration: 1_000,
      },
    }
  );

  worker.on('completed', job => {
    logger.info(`[Worker] ✅ ${job.id} (${job.name}) done`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Worker] ❌ ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  worker.on('error', err => {
    logger.error('[Worker] Worker error:', err.message);
  });

  return worker;
}
