import { Queue } from 'bullmq';
import fsPromises from 'fs/promises';
import path from 'path';
import { newBullMQRedisConnection } from '../lib/redisClient.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

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

// Per-campaign interval tracking so removeCampaignOptimization can actually
// clear the correct timer instead of leaking it until process exit.
const _campaignTimers = new Map<string, NodeJS.Timeout>();

async function runDirect(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.warn(`[AutonomousScheduler] ${name} error: ${(err as Error).message}`);
  }
}

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

  // system_logs pruning — runs every hour (keeps last 7 days)
  _timers.push(
    setInterval(() => runDirect('prune-system-logs', () => pruneSystemLogs(7)), 3_600_000)
  );

  // audit_log + notifications + upload-cache pruning — runs every 24 hours
  const DAILY = 86_400_000;
  _timers.push(
    setInterval(() => runDirect('prune-audit-log',    () => pruneAuditLog(90)),    DAILY)
  );
  _timers.push(
    setInterval(() => runDirect('prune-notifications', () => pruneNotifications(30)), DAILY)
  );
  _timers.push(
    setInterval(() => runDirect('prune-upload-dirs',  () => pruneUploadDirs(7)),   DAILY)
  );

  logger.info('[AutonomousScheduler] ✅ Autonomous repeatable jobs active (setInterval, no Lua)');
}

export async function scheduleCampaignOptimization(campaignId: string): Promise<void> {
  if (_campaignTimers.has(campaignId)) return;
  const jobName = `campaign-optimize-${campaignId}`;
  const t = setInterval(async () => {
    try {
      await getQueue().add(jobName, { campaignId });
    } catch (err) {
      logger.warn(`[AutonomousScheduler] Failed to enqueue ${jobName}: ${(err as Error).message}`);
    }
  }, 300_000);
  _campaignTimers.set(campaignId, t);
  _timers.push(t);
  logger.info(`[AutonomousScheduler] Campaign ${campaignId} optimization scheduled (every 5min)`);
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
