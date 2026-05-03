import { Queue } from 'bullmq';
import fsPromises from 'fs/promises';
import path from 'path';
import { newBullMQRedisConnection } from '../lib/redisClient.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { withSchedLock } from '../lib/distributedLock.js';

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
//
// Each setInterval body is wrapped with withSchedLock() so that only ONE pod
// in the cluster executes the task per tick. Other pods see the PDIM lock key
// and skip that tick. The lock TTL is set to ~90% of the interval period so
// that if the pod holding the lock crashes, the lock auto-expires before the
// next tick and another pod can take over.
const _timers: NodeJS.Timeout[] = [];

// Per-campaign interval tracking so removeCampaignOptimization can actually
// clear the correct timer instead of leaking it until process exit.
const _campaignTimers = new Map<string, NodeJS.Timeout>();

// ── Maintenance helpers ────────────────────────────────────────────────────

/** Delete system_logs rows older than `days` days. */
async function pruneSystemLogs(days = 7): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = await db.execute(
    sql`DELETE FROM system_logs WHERE timestamp < ${cutoff}`
  );
  const count = (result as Record<string, unknown>).rowCount ?? 0;
  if (count > 0) logger.info(`[Maintenance] Pruned ${count} system_logs rows older than ${days}d`);
}

/** Delete audit_log rows older than `days` days (keep critical entries). */
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
    try {
      entries = await fsPromises.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const stat = await fsPromises.stat(full);
        if (stat.isFile() && stat.mtimeMs < cutoffMs) {
          await fsPromises.unlink(full);
          total++;
        }
      } catch {
        // File already gone or permission issue — skip silently.
      }
    }
  }
  if (total > 0) logger.info(`[Maintenance] Pruned ${total} upload cache files older than ${days}d`);
}

// ── Job setup ──────────────────────────────────────────────────────────────
//
// Lock TTL strategy (per task):
//   TTL = interval × 0.9  — lock expires before the next tick so a crashed pod
//   never permanently blocks job execution.  The remaining 10% is a safety buffer
//   that allows the actual job to run for up to 90% of the interval period.
//
//   60 s interval  → 54 s TTL
//   3 600 s (1 h)  → 3 240 s (54 min) TTL
//   86 400 s (24 h) → 77 760 s (~21.6 h) TTL
//   300 s (5 min)  → 270 s TTL

export async function setupRepeatableJobs(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;

  // content-dispatch: every 60 s — lock TTL 54 s
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:content-dispatch', 54, async () => {
        const { autonomousService } = await import('./autonomousService.js');
        await autonomousService.runContentDispatch();
      });
    }, 60_000)
  );

  // analytics: every 1 h — lock TTL 54 min
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:analytics', 3_240, async () => {
        const { autonomousService } = await import('./autonomousService.js');
        await autonomousService.runPeriodicAnalytics();
      });
    }, 3_600_000)
  );

  // metrics-persist: every 60 s — lock TTL 54 s
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:metrics-persist', 54, async () => {
        const { autonomousService } = await import('./autonomousService.js');
        await autonomousService.persistMetricsToCache();
      });
    }, 60_000)
  );

  // prune-system-logs: every 1 h — lock TTL 54 min
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:prune-system-logs', 3_240, () => pruneSystemLogs(7));
    }, 3_600_000)
  );

  // prune-audit-log: every 24 h — lock TTL ~21.6 h
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:prune-audit-log', 77_760, () => pruneAuditLog(90));
    }, 86_400_000)
  );

  // prune-notifications: every 24 h — lock TTL ~21.6 h
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:prune-notifications', 77_760, () => pruneNotifications(30));
    }, 86_400_000)
  );

  // prune-upload-dirs: every 24 h — lock TTL ~21.6 h
  _timers.push(
    setInterval(async () => {
      await withSchedLock('sched:prune-upload-dirs', 77_760, () => pruneUploadDirs(7));
    }, 86_400_000)
  );

  logger.info('[AutonomousScheduler] ✅ Autonomous repeatable jobs active (setInterval + distributed lock, no Lua)');
}

export async function scheduleCampaignOptimization(campaignId: string): Promise<void> {
  if (_campaignTimers.has(campaignId)) return;
  const jobName = `campaign-optimize-${campaignId}`;
  // campaign-optimize: every 5 min — lock TTL 4.5 min (270 s)
  const t = setInterval(async () => {
    await withSchedLock(`sched:${jobName}`, 270, async () => {
      try {
        await getQueue().add(jobName, { campaignId });
      } catch (err) {
        logger.warn(`[AutonomousScheduler] Failed to enqueue ${jobName}: ${(err as Error).message}`);
      }
    });
  }, 300_000);
  _campaignTimers.set(campaignId, t);
  _timers.push(t);
  logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization scheduled (every 5min, distributed lock)`);
}

export async function removeCampaignOptimization(campaignId: string): Promise<void> {
  const t = _campaignTimers.get(campaignId);
  if (t) {
    clearInterval(t);
    _campaignTimers.delete(campaignId);
    const idx = _timers.indexOf(t);
    if (idx !== -1) _timers.splice(idx, 1);
    logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization stopped`);
  }
}

export async function teardownRepeatableJobs(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;
  _campaignTimers.clear();
  logger.info('[AutonomousScheduler] System repeatable jobs stopped');
}

export async function closeScheduler(): Promise<void> {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;
  _campaignTimers.clear();
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
