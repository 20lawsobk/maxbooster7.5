import { Worker, type Job } from 'bullmq';
import { newBullMQRedisConnection } from '../lib/redisClient.js';
import { logger } from '../logger.js';
import { AUTONOMOUS_QUEUE } from '../services/autonomousJobScheduler.js';

let _worker: Worker | null = null;

export function createAutonomousWorker(): Worker {
  const w = new Worker(
    AUTONOMOUS_QUEUE,
    async (job: Job) => {
      const { autonomousService } = await import('../services/autonomousService.js');

      switch (true) {
        case job.name === 'content-dispatch':
          await autonomousService.runContentDispatch();
          break;

        case job.name === 'analytics':
          await autonomousService.runPeriodicAnalytics();
          break;

        case job.name === 'metrics-persist':
          await autonomousService.persistMetricsToCache();
          break;

        case job.name.startsWith('campaign-optimize-'):
          await autonomousService.runCampaignOptimization(job.data.campaignId);
          break;

        default:
          logger.warn(`[AutonomousWorker] Unknown job type: ${job.name}`);
      }
    },
    {
      connection: newBullMQRedisConnection(),
      concurrency: 2,
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 50 },
    },
  );

  w.on('completed', (job) =>
    logger.info(`✅ [AutonomousWorker] ${job.name} completed`),
  );
  w.on('failed', (job, err) =>
    logger.error(`❌ [AutonomousWorker] ${job?.name} failed: ${err.message}`),
  );
  w.on('error', (err) =>
    logger.error(`❌ [AutonomousWorker] Error: ${err.message}`),
  );

  _worker = w;
  return w;
}

export async function closeAutonomousWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
