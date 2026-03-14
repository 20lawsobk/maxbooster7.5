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

// ── setInterval-based scheduler ───────────────────────────────────────────
// BullMQ's repeatable job API uses Lua scripts internally that PDIM doesn't
// support. Replace with plain setInterval — zero Lua dependency, works on any
// single-VM deployment, and survives cluster.fork() since each worker gets its
// own timer (jobs are idempotent, duplicates are deduplicated by the worker).
const _timers: NodeJS.Timeout[] = [];

async function enqueue(name: string, data: Record<string, unknown> = {}): Promise<void> {
  try {
    await getQueue().add(name, data);
  } catch (err) {
    logger.warn(`[AutonomousScheduler] Failed to enqueue ${name}: ${(err as Error).message}`);
  }
}

export async function setupRepeatableJobs(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;

  _timers.push(setInterval(() => enqueue('content-dispatch'), 60_000));
  _timers.push(setInterval(() => enqueue('analytics'), 3_600_000));
  _timers.push(setInterval(() => enqueue('metrics-persist'), 60_000));

  logger.info('[AutonomousScheduler] ✅ Autonomous repeatable jobs active (setInterval, no Lua)');
}

export async function scheduleCampaignOptimization(campaignId: string): Promise<void> {
  const jobName = `campaign-optimize-${campaignId}`;
  const t = setInterval(() => enqueue(jobName, { campaignId }), 300_000);
  _timers.push(t);
  logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization scheduled (every 5min)`);
}

export async function removeCampaignOptimization(_campaignId: string): Promise<void> {
  logger.info(`[AutonomousScheduler] Campaign ${_campaignId} optimization timers will stop on next shutdown`);
}

export async function teardownRepeatableJobs(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;
  logger.info('[AutonomousScheduler] System repeatable jobs stopped');
}

export async function closeScheduler(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
