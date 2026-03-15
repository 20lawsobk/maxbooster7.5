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
        removeOnComplete: true,
        removeOnFail: { count: 10 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
      },
    });
  }
  return _queue;
}

// ── setInterval-based scheduler ───────────────────────────────────────────
// Periodic jobs (content-dispatch, analytics, metrics-persist) are called
// directly without BullMQ to avoid Lua-dependent queue.add() calls against
// PDIM (which causes LuaExecutor timeouts and 429s). Campaign optimization
// jobs still use BullMQ since they are triggered by user actions.
const _timers: NodeJS.Timeout[] = [];

async function runDirect(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.warn(`[AutonomousScheduler] ${name} error: ${(err as Error).message}`);
  }
}

export async function setupRepeatableJobs(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;

  _timers.push(
    setInterval(async () => {
      const { autonomousService } = await import('./autonomousService.js');
      await runDirect('content-dispatch', () => autonomousService.runContentDispatch());
    }, 60_000)
  );

  _timers.push(
    setInterval(async () => {
      const { autonomousService } = await import('./autonomousService.js');
      await runDirect('analytics', () => autonomousService.runPeriodicAnalytics());
    }, 3_600_000)
  );

  _timers.push(
    setInterval(async () => {
      const { autonomousService } = await import('./autonomousService.js');
      await runDirect('metrics-persist', () => autonomousService.persistMetricsToCache());
    }, 60_000)
  );

  logger.info('[AutonomousScheduler] ✅ Autonomous repeatable jobs active (setInterval, no Lua)');
}

export async function scheduleCampaignOptimization(campaignId: string): Promise<void> {
  const jobName = `campaign-optimize-${campaignId}`;
  const t = setInterval(async () => {
    try {
      await getQueue().add(jobName, { campaignId });
    } catch (err) {
      logger.warn(`[AutonomousScheduler] Failed to enqueue ${jobName}: ${(err as Error).message}`);
    }
  }, 300_000);
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
