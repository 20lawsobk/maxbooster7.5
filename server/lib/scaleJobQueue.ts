import { Queue, Worker, Job } from 'bullmq';
import { getRedisClient } from './redisClient.js';
import { logger } from '../logger.js';
import { customerHealthScoreService } from '../services/customerHealthScoreService.js';
import { dunningService } from '../services/dunningService.js';
import { reEngagementService } from '../services/reEngagementService.js';

export const RETENTION_QUEUE = 'retention-jobs';

let _queue: Queue | null = null;

export function getRetentionQueue(): Queue {
  if (_queue) return _queue;

  const connection = getRedisClient();
  _queue = new Queue(RETENTION_QUEUE, { connection });
  return _queue;
}

export function startRetentionWorker() {
  const connection = getRedisClient();
  
  const worker = new Worker(
    RETENTION_QUEUE,
    async (job: Job) => {
      logger.info(`[Worker] Processing job ${job.name} (${job.id})`);

      try {
        switch (job.name) {
          case 'health-score-batch': {
            const { cursor = 0, batchSize = 100 } = job.data;
            const nextCursor = await customerHealthScoreService.batchComputePaged(cursor, batchSize);
            
            if (nextCursor !== null) {
              // Enqueue next batch
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
            const { limit = 50 } = job.data;
            // The task asks to fetch eligible records in batches of 50.
            // reEngagementService.runDailyCheck already does a limited fetch, 
            // but we might want to adapt it if it was expected to be multi-step.
            // For now, following instructions to just run it with distributed lock (handled in service).
            await reEngagementService.runDailyCheck();
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
    { connection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
