import { Queue } from 'bullmq';
import { newBullMQRedisConnection } from '../lib/redisClient.js';
import { logger } from '../logger.js';

export const AUTONOMOUS_QUEUE = 'autonomous';

let _queue: Queue | null = null;

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(AUTONOMOUS_QUEUE, {
      connection: newBullMQRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return _queue;
}

export async function setupRepeatableJobs(): Promise<void> {
  const q = getQueue();
  const existing = await q.getRepeatableJobs();
  const existingNames = new Set(existing.map((j) => j.name));

  if (!existingNames.has('content-dispatch')) {
    await q.add('content-dispatch', {}, { repeat: { every: 60_000 } });
    logger.info('[AutonomousScheduler] Registered content-dispatch (every 60s)');
  }

  if (!existingNames.has('analytics')) {
    await q.add('analytics', {}, { repeat: { every: 3_600_000 } });
    logger.info('[AutonomousScheduler] Registered analytics (every 1h)');
  }

  if (!existingNames.has('metrics-persist')) {
    await q.add('metrics-persist', {}, { repeat: { every: 60_000 } });
    logger.info('[AutonomousScheduler] Registered metrics-persist (every 60s)');
  }

  logger.info('[AutonomousScheduler] ✅ Autonomous repeatable jobs active in Redis');
}

export async function scheduleCampaignOptimization(campaignId: string): Promise<void> {
  const q = getQueue();
  const jobName = `campaign-optimize-${campaignId}`;
  const existing = await q.getRepeatableJobs();

  if (existing.find((j) => j.name === jobName)) {
    return;
  }

  await q.add(jobName, { campaignId }, { repeat: { every: 300_000 } });
  logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization scheduled (every 5min)`);
}

export async function removeCampaignOptimization(campaignId: string): Promise<void> {
  const q = getQueue();
  const jobName = `campaign-optimize-${campaignId}`;
  const existing = await q.getRepeatableJobs();
  const job = existing.find((j) => j.name === jobName);

  if (job) {
    await q.removeRepeatableByKey(job.key);
    logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization removed`);
  }
}

export async function teardownRepeatableJobs(): Promise<void> {
  const q = getQueue();
  const jobs = await q.getRepeatableJobs();

  for (const job of jobs) {
    if (
      job.name === 'content-dispatch' ||
      job.name === 'analytics' ||
      job.name === 'metrics-persist'
    ) {
      await q.removeRepeatableByKey(job.key);
    }
  }

  logger.info('[AutonomousScheduler] System repeatable jobs removed from Redis');
}

export async function closeScheduler(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
