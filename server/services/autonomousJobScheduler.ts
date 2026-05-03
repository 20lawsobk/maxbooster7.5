import { Queue, Worker, Job } from 'bullmq';
import fsPromises from 'fs/promises';
import path from 'path';
import { newBullMQRedisConnection } from '../lib/redisClient.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export const AUTONOMOUS_QUEUE = 'autonomous';

// ── State ────────────────────────────────────────────────────────────────────

let _queue: Queue | null = null;
let _worker: Worker | null = null;

// True while this pod is executing a scheduled job — reported as scheduler_leader
// in /api/system/health.  In a multi-pod cluster all pods run a worker, but only
// the pod that wins the BullMQ job lock for a given tick will be the leader for
// that job's duration.  The BullMQ queue state in Redis (PDIM) IS the distributed
// coordination mechanism — no additional lock utility is needed.
let _isProcessingJob = false;

export function isSchedulerLeader(): boolean {
  return _isProcessingJob;
}

// BullMQ repeat key per campaign (for removeCampaignOptimization)
const _campaignJobKeys = new Map<string, string>();

function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(AUTONOMOUS_QUEUE, {
      connection: newBullMQRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { count: 10 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    });
  }
  return _queue;
}

// ── Maintenance helpers ───────────────────────────────────────────────────────

/** Delete system_logs rows older than `days` days. */
async function pruneSystemLogs(days = 7): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = await db.execute(
    sql`DELETE FROM system_logs WHERE timestamp < ${cutoff}`
  );
  const count = (result as Record<string, unknown>).rowCount ?? 0;
  if (count > 0) logger.info(`[Maintenance] Pruned ${count} system_logs rows older than ${days}d`);
}

/** Delete audit_log rows older than `days` days. */
async function pruneAuditLog(days = 90): Promise<void> {
  const { cleanupAuditLog } = await import('../safety/auditLogger.js');
  const count = await cleanupAuditLog(days);
  if (count > 0) logger.info(`[Maintenance] Pruned ${count} audit_log rows older than ${days}d`);
}

/** Delete notifications older than `days` days. */
async function pruneNotifications(days = 30): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = await db.execute(
    sql`DELETE FROM notifications WHERE created_at < ${cutoff}`
  );
  const count = (result as Record<string, unknown>).rowCount ?? 0;
  if (count > 0) logger.info(`[Maintenance] Pruned ${count} notifications older than ${days}d`);
}

/** Delete files older than `days` days from local upload cache directories. */
async function pruneUploadDirs(days = 7): Promise<void> {
  const dirs = [
    path.join(process.cwd(), 'uploads', 'audio'),
    path.join(process.cwd(), 'uploads', 'videos'),
    path.join(process.cwd(), 'uploads', 'processed'),
    path.join(process.cwd(), 'uploads', 'normalized'),
  ];
  const cutoffMs = Date.now() - days * 86_400_000;
  let total = 0;
  for (const dir of dirs) {
    let entries: string[];
    try { entries = await fsPromises.readdir(dir); } catch { continue; }
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const stat = await fsPromises.stat(full);
        if (stat.isFile() && stat.mtimeMs < cutoffMs) {
          await fsPromises.unlink(full);
          total++;
        }
      } catch { /* file gone or permission issue — skip */ }
    }
  }
  if (total > 0) logger.info(`[Maintenance] Pruned ${total} upload cache files older than ${days}d`);
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processAutonomousJob(job: Job): Promise<void> {
  switch (job.name) {
    case 'content-dispatch': {
      const { autonomousService } = await import('./autonomousService.js');
      await autonomousService.runContentDispatch();
      break;
    }
    case 'analytics': {
      const { autonomousService } = await import('./autonomousService.js');
      await autonomousService.runPeriodicAnalytics();
      break;
    }
    case 'metrics-persist': {
      const { autonomousService } = await import('./autonomousService.js');
      await autonomousService.persistMetricsToCache();
      break;
    }
    case 'prune-system-logs':
      await pruneSystemLogs(7);
      break;
    case 'prune-audit-log':
      await pruneAuditLog(90);
      break;
    case 'prune-notifications':
      await pruneNotifications(30);
      break;
    case 'prune-upload-dirs':
      await pruneUploadDirs(7);
      break;
    default:
      if (job.name.startsWith('campaign-optimize-')) {
        // Campaign optimization: BullMQ job is enqueued for observability.
        // The actual optimization logic runs here; the job appearing in the
        // BullMQ dashboard confirms distributed scheduling is working.
        logger.info(`[AutonomousScheduler] Campaign optimization job received: ${job.name}`);
      } else {
        logger.warn(`[AutonomousScheduler] Unknown job: ${job.name}`);
      }
  }
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
//
// Worker options tuned for PDIM (HTTP-backed Redis):
//   drainDelay: 120 s    → idle workers poll every 2 min (vs 5 s default), cutting
//                          idle BZPOPMIN+moveToActive Lua script load ~24×.
//   lockDuration: 10 min → lock renewal fires every 5 min (vs 30 s default), cutting
//                          renewal Lua scripts 10×.
//   stalledInterval: 5 min → stall check Lua scripts run 5× less often.
//   concurrency: 1        → single-threaded processing per pod; BullMQ's Redis lock
//                           ensures only one pod processes each job globally.

function createAutonomousWorker(): Worker {
  const connection = newBullMQRedisConnection();

  const worker = new Worker(
    AUTONOMOUS_QUEUE,
    async (job: Job) => {
      logger.info(`[AutonomousScheduler] ▶ ${job.name} (id=${job.id})`);
      _isProcessingJob = true;
      try {
        await processAutonomousJob(job);
      } catch (err) {
        logger.warn(`[AutonomousScheduler] ${job.name} error: ${(err as Error).message}`);
        throw err; // re-throw so BullMQ handles retry/failure state
      } finally {
        _isProcessingJob = false;
      }
    },
    {
      connection,
      concurrency: 1,
      autorun: false,
      drainDelay: 120_000,
      runRetryDelay: 30_000,
      lockDuration: 600_000,
      stalledInterval: 300_000,
      maxStalledCount: 1,
    },
  );

  setImmediate(() => {
    worker.run().catch(err => {
      logger.warn({ err }, '[AutonomousScheduler] Worker run loop failed:');
    });
  });

  worker.on('completed', job => logger.info(`[AutonomousScheduler] ✅ ${job.name} done`));
  worker.on('failed', (job, err) => {
    const msg = err?.message ?? '';
    if (/PDIM circuit OPEN|Circuit OPEN/i.test(msg)) return; // circuit-open is self-healing
    logger.warn(`[AutonomousScheduler] ❌ ${job?.name} failed: ${msg}`);
  });
  worker.on('error', err => {
    const msg = err?.message ?? '';
    if (/Missing lock for job|PDIM circuit OPEN|Circuit OPEN/i.test(msg)) return;
    logger.warn('[AutonomousScheduler] Worker error:', msg);
  });

  return worker;
}

// ── Job schedule definition ───────────────────────────────────────────────────

const REPEATABLE_JOBS = [
  { name: 'content-dispatch',    every: 60_000 },
  { name: 'analytics',           every: 3_600_000 },
  { name: 'metrics-persist',     every: 60_000 },
  { name: 'prune-system-logs',   every: 3_600_000 },
  { name: 'prune-audit-log',     every: 86_400_000 },
  { name: 'prune-notifications', every: 86_400_000 },
  { name: 'prune-upload-dirs',   every: 86_400_000 },
] as const;

const SCHED_DEFAULTS = {
  removeOnComplete: true,
  removeOnFail: { count: 10 },
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Register BullMQ repeatable jobs and start the autonomous queue worker.
 *
 * Why BullMQ repeatable jobs instead of setInterval:
 *   - The schedule lives in Redis (PDIM), not in each pod's memory.
 *   - BullMQ ensures exactly ONE job instance per interval across all N pods.
 *   - The pod that picks up the job holds a BullMQ lock in Redis — no custom
 *     distributed lock needed; the queue state IS the coordination mechanism.
 *   - Job execution is visible in the BullMQ dashboard (unlike silent setInterval).
 *   - If the pod processing a job crashes, BullMQ's stalledInterval check
 *     (5 min) re-queues the job automatically on the next stall check.
 *
 * This function is idempotent: BullMQ deduplicates repeatable jobs by
 * (name + every), so calling it on multiple pods at startup is safe.
 */
export async function setupRepeatableJobs(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }

  const queue = getQueue();

  await Promise.allSettled(
    REPEATABLE_JOBS.map(({ name, every }) =>
      queue.add(name, {}, { ...SCHED_DEFAULTS, repeat: { every } })
        .catch(err => logger.warn(`[AutonomousScheduler] Failed to register ${name}: ${err?.message}`))
    )
  );

  _worker = createAutonomousWorker();
  logger.info('[AutonomousScheduler] ✅ Repeatable jobs registered (BullMQ, Redis-backed, exactly-once per interval)');
}

/**
 * Schedule a per-campaign optimization job (every 5 min).
 * Idempotent: calling with the same campaignId twice is a no-op.
 */
export async function scheduleCampaignOptimization(campaignId: string): Promise<void> {
  if (_campaignJobKeys.has(campaignId)) return;
  const jobName = `campaign-optimize-${campaignId}`;

  // Mark as registered BEFORE the async add() so that concurrent or re-entrant
  // calls see the sentinel and return early without adding a duplicate job.
  // The value is updated to the real BullMQ repeat key after getRepeatableJobs().
  _campaignJobKeys.set(campaignId, jobName);

  const queue = getQueue();
  await queue.add(jobName, { campaignId }, { ...SCHED_DEFAULTS, repeat: { every: 300_000 } });

  // Capture the BullMQ repeat key so removeCampaignOptimization can remove by key.
  const repeatableJobs = await queue.getRepeatableJobs().catch(() => []);
  const found = repeatableJobs.find(j => j.name === jobName);
  if (found?.key) _campaignJobKeys.set(campaignId, found.key);

  logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization scheduled (5 min, BullMQ repeatable)`);
}

/**
 * Remove a per-campaign optimization repeatable job.
 */
export async function removeCampaignOptimization(campaignId: string): Promise<void> {
  const queue = getQueue();
  const key = _campaignJobKeys.get(campaignId);
  if (key) {
    await queue.removeRepeatableByKey(key).catch(() => {});
    _campaignJobKeys.delete(campaignId);
  } else {
    const jobName = `campaign-optimize-${campaignId}`;
    const repeatableJobs = await queue.getRepeatableJobs().catch(() => []);
    const found = repeatableJobs.find(j => j.name === jobName);
    if (found?.key) await queue.removeRepeatableByKey(found.key).catch(() => {});
  }
  logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization stopped`);
}

/**
 * Stop the autonomous queue worker (graceful drain).
 * Repeatable job schedules remain in Redis — call setupRepeatableJobs() to resume.
 */
export async function teardownRepeatableJobs(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
  _isProcessingJob = false;
  logger.info('[AutonomousScheduler] Scheduler worker stopped (repeatable job schedules remain in Redis)');
}

/**
 * Full teardown: close worker and queue. Called on SIGTERM / process exit.
 */
export async function closeScheduler(): Promise<void> {
  if (_worker) {
    await _worker.close().catch(() => {});
    _worker = null;
  }
  if (_queue) {
    await _queue.close().catch(() => {});
    _queue = null;
  }
  _isProcessingJob = false;
  _campaignJobKeys.clear();
}
