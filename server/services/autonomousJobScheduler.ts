import { Queue, Worker, Job } from "bullmq";
import fsPromises from "fs/promises";
import path from "path";
import { newBullMQRedisConnection } from "../lib/redisClient.js";
import { logger } from "../logger.js";
import { db } from "../db.js";
import { sql } from "drizzle-orm";

export const AUTONOMOUS_QUEUE = "autonomous";

// ── State ────────────────────────────────────────────────────────────────────

let queue: Queue | null = null;
let worker: Worker | null = null;

// Track whether this pod is currently executing a job AND when it last finished one.
// isSchedulerLeader() returns true while a job is running OR within 2× the shortest
// interval (120 s) after the last completion.  This gives operators a stable signal
// in the BullMQ dashboard: the pod that processed the most recent job stays "leader"
// between ticks rather than everyone reporting false when idle.
let _isProcessingJob = false;
let _lastJobCompletedAt = 0;
const LEADER_STALENESS_MS = 120_000; // 2× content-dispatch interval (60 s)

export function isSchedulerLeader(): boolean {
  return (
    _isProcessingJob || Date?.now() - _lastJobCompletedAt < LEADER_STALENESS_MS
  );
}

// BullMQ repeat key per campaign (for removeCampaignOptimization)
const _campaignJobKeys = new Map<string, string>();

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(AUTONOMOUS_QUEUE, {
      connection: newBullMQRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { count: 10 },
        attempts: 2,
        backoff: { type: "exponential", delay: 10_000 },
      },
    });
  }
  return queue;
}

// ── Maintenance helpers ───────────────────────────────────────────────────────

/** Delete system_logs rows older than `days` days. */
async function pruneSystemLogs(days = 7): Promise<void> {
  const cutoff = new Date(Date?.now() - days * 86_400_000);
  const result = await db?.execute(
    sql`DELETE FROM system_logs WHERE timestamp < ${cutoff}`,
  );
  const count = (result as Record<string, unknown>).rowCount ?? 0;
  if (count > 0)
    logger.info(
      `[Maintenance] Pruned ${count} system_logs rows older than ${days}d`,
    );
}

/** Delete audit_log rows older than `days` days. */
async function pruneAuditLog(days = 90): Promise<void> {
  const { cleanupAuditLog } = await import("../safety/auditLogger.js");
  const count = await cleanupAuditLog(days);
  if (count > 0)
    logger.info(
      `[Maintenance] Pruned ${count} audit_log rows older than ${days}d`,
    );
}

/** Delete notifications older than `days` days. */
async function pruneNotifications(days = 30): Promise<void> {
  const cutoff = new Date(Date?.now() - days * 86_400_000);
  const result = await db?.execute(
    sql`DELETE FROM notifications WHERE created_at < ${cutoff}`,
  );
  const count = (result as Record<string, unknown>).rowCount ?? 0;
  if (count > 0)
    logger.info(
      `[Maintenance] Pruned ${count} notifications older than ${days}d`,
    );
}

/** Delete files older than `days` days from local upload cache directories. */
async function pruneUploadDirs(days = 7): Promise<void> {
  const dirs = [
    path?.join(process.cwd(), "uploads", "audio"),
    path?.join(process.cwd(), "uploads", "videos"),
    path?.join(process.cwd(), "uploads", "processed"),
    path?.join(process.cwd(), "uploads", "normalized"),
  ];
  const cutoffMs = Date?.now() - days * 86_400_000;
  let total = 0;

  // Scan all directories in parallel — each dir is independent I/O.
  await Promise?.allSettled(
    dirs?.map(async (dir) => {
      let entries: string[];
      try {
        entries = await fsPromises?.readdir(dir);
      } catch {
        return;
      }

      // Delete eligible files within each dir in parallel (up to 8 concurrent unlinks).
      const cutoffEntries = (
        await Promise?.allSettled(
          entries?.map(async (name) => {
            const full = path?.join(dir, name);
            try {
              const stat = await fsPromises?.stat(full);
              return stat?.isFile() && stat?.mtimeMs < cutoffMs ? full : null;
            } catch {
              return null;
            }
          }),
        )
      )
        .filter(
          (r): r is { status: "fulfilled"; value: string } =>
            r?.status === "fulfilled" && r?.value !== null,
        )
        .map((r) => r?.value);

      await Promise?.allSettled(
        cutoffEntries?.map(async (full) => {
          try {
            await fsPromises?.unlink(full);
            total++;
          } catch {
            /* gone */
          }
        }),
      );
    }),
  );

  if (total > 0)
    logger.info(
      `[Maintenance] Pruned ${total} upload cache files older than ${days}d`,
    );
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processAutonomousJob(job: Job): Promise<void> {
  let jobName = job?.name;
  if (!jobName) {
    // BullMQ-over-PDIM (wasmoon LuaExecutor) can drop the job name from the
    // job hash, so EVERY repeatable job arrives with name=undefined — not just
    // stale entries. The repeatable job id still encodes the name as
    // "repeat:<name>:<timestamp>", so recover it from there before giving up.
    const m = /^repeat:(.+):\d+$/.exec(String(job?.id ?? ""));
    const recovered = m?.[1];
    if (
      recovered &&
      (REPEATABLE_JOBS.some((j) => j.name === recovered) ||
        recovered.startsWith("campaign-optimize-"))
    ) {
      jobName = recovered;
      logger.info(
        `[AutonomousScheduler] Recovered job name "${recovered}" from id=${job?.id} (name missing from job hash)`,
      );
    } else {
      logger.warn(
        `[AutonomousScheduler] Skipping job with undefined name (id=${job?.id}) — could not recover a known job name`,
      );
      return;
    }
  }
  switch (jobName) {
    case "content-dispatch": {
      const { autonomousService } = await import("./autonomousService.js");
      await autonomousService?.runContentDispatch();
      break;
    }
    case "analytics": {
      const { autonomousService } = await import("./autonomousService.js");
      await autonomousService?.runPeriodicAnalytics();
      break;
    }
    case "metrics-persist": {
      const { autonomousService } = await import("./autonomousService.js");
      await autonomousService?.persistMetricsToCache();
      break;
    }
    case "prune-system-logs":
      await pruneSystemLogs(7);
      break;
    case "prune-audit-log":
      await pruneAuditLog(90);
      break;
    case "prune-notifications":
      await pruneNotifications(30);
      break;
    case "prune-upload-dirs":
      await pruneUploadDirs(7);
      break;
    case "beat-money-loop-tick": {
      const { beatMoneyLoopService } = await import(
        "./beatMoneyLoopService.js"
      );
      const result = await beatMoneyLoopService?.tick();
      if (result?.ran) {
        logger.info(
          `[AutonomousScheduler] beat-money-loop-tick fired cycle ${result?.cycleId} (${result?.reason})`,
        );
      }
      // Always opportunistically refresh analytics so dashboards stay current
      await beatMoneyLoopService
        .analyseRecentCycles()
        .catch((err) =>
          logger.warn(
            { err },
            "[AutonomousScheduler] beat-money-loop analyseRecentCycles failed",
          ),
        );
      break;
    }
    default:
      if (jobName.startsWith("campaign-optimize-")) {
        const campaignId = job?.data?.campaignId as string | undefined;
        if (campaignId) {
          const { autonomousService } = await import("./autonomousService.js");
          await autonomousService?.runCampaignOptimization(campaignId);
        } else {
          logger.warn(
            `[AutonomousScheduler] campaign-optimize job missing campaignId: ${jobName}`,
          );
        }
      } else {
        logger.warn(`[AutonomousScheduler] Unknown job: ${jobName}`);
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
        _lastJobCompletedAt = Date.now(); // update on success so isSchedulerLeader() stays true between ticks
      } catch (err) {
        logger.warn(
          `[AutonomousScheduler] ${job.name} error: ${(err as Error).message}`,
        );
        throw err; // re-throw so BullMQ handles retry/failure state
      } finally {
        _isProcessingJob = false;
      }
    },
    {
      connection,
      // concurrency: 4 — allows up to 4 independent jobs (e.g. multiple prune
      // jobs or a prune + analytics) to run simultaneously on this pod.
      // BullMQ's Redis lock still ensures each repeatable job fires exactly once
      // across all pods, so raising concurrency only helps when the queue has
      // multiple jobs ready at the same time (e?.g. at restart drain).
      concurrency: 4,
      autorun: false,
      drainDelay: 120_000,
      runRetryDelay: 30_000,
      lockDuration: 600_000,
      stalledInterval: 300_000,
      maxStalledCount: 1,
    },
  );

  setImmediate(() => {
    worker?.run().catch((err) => {
      logger.warn({ err }, "[AutonomousScheduler] Worker run loop failed:");
    });
  });

  worker?.on("completed", (job) =>
    logger.info(`[AutonomousScheduler] ✅ ${job?.name} done`),
  );
  worker?.on("failed", (job, err) => {
    const msg = err?.message ?? "";
    if (/PDIM circuit OPEN|Circuit OPEN/i?.test(msg)) return; // circuit-open is self-healing
    logger.warn(`[AutonomousScheduler] ❌ ${job?.name} failed: ${msg}`);
  });
  worker?.on("error", (err) => {
    const full = err?.message ?? "";
    // Strip Lua/Node?.js stack traces — keep only the first line of the message.
    const msg = full?.split("\n")[0] ?? full;
    // Completely silent: circuit-open and PDIM 5xx are handled by the
    // circuit breaker which already emits its own diagnostics.
    if (
      /Missing lock for job|PDIM circuit OPEN|Circuit OPEN|PDIM HTTP 5/i?.test(
        msg,
      )
    )
      return;
    // BullMQ lock-renewal errors: job held the lock longer than lockDuration
    // (600 s here).  BullMQ re-queues automatically — self-healing.
    // Also silence hard-killed worker messages (LuaExecutor already logged them at ERROR).
    if (
      /Maximum lock renew count reached|lock is lost|Lock renewal failed|lock expired/i?.test(
        msg,
      ) ||
      /StalledJobsError|worker hard-killed|moveToFinished/i?.test(msg)
    ) {
      logger.warn(
        `[AutonomousScheduler] BullMQ lock/stall (self-healing): ${msg}`,
      );
      return;
    }
    // Unknown — log full error object so we can diagnose it
    logger.warn(
      { err },
      `[AutonomousScheduler] Unexpected worker error: ${msg}`,
    );
  });

  return worker;
}

// ── Job schedule definition ───────────────────────────────────────────────────

const REPEATABLE_JOBS = [
  { name: "content-dispatch", every: 60_000 },
  { name: "analytics", every: 3_600_000 },
  { name: "metrics-persist", every: 60_000 },
  { name: "prune-system-logs", every: 3_600_000 },
  { name: "prune-audit-log", every: 86_400_000 },
  { name: "prune-notifications", every: 86_400_000 },
  { name: "prune-upload-dirs", every: 86_400_000 },
  { name: "beat-money-loop-tick", every: 1_800_000 }, // 30 min heartbeat; cycle fires only when due
] as const;

const SCHED_DEFAULTS = {
  removeOnComplete: true,
  removeOnFail: { count: 10 },
  attempts: 2,
  backoff: { type: "exponential" as const, delay: 10_000 },
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
/**
 * Wait until the PDIM caller queue has genuinely settled before registering
 * BullMQ repeatable jobs.
 *
 * The startup PDIM burst arrives 10–30 s after boot (as BaseTrainer, MaxCoreSync,
 * ScoreCalibrator, HyperLearning, etc. all initialise simultaneously) and
 * typically takes 60–90 s to drain.  `waitForPdimSettled()` always waits at
 * least `minWaitMs` (default 75 s) before even checking depth — this covers
 * the burst even when the queue appears empty at call time (which is always,
 * because `setupRepeatableJobs` is called very early in the boot sequence).
 * After the initial wait it polls every 5 s until depth < `maxDepth` (40) or
 * the total deadline (minWait + 180 s) is reached.
 */
async function waitForPdimSettled(
  maxDepth = 40,
  minWaitMs = 75_000,
  extraTimeoutMs = 300_000,
): Promise<void> {
  // Single-instance mode: no concurrent PDIM writers, no burst to wait for.
  const { isPdimConfigured } = await import("../lib/pdimClient.js");
  if (!isPdimConfigured()) return;

  // Fast-path: if the circuit breaker is already OPEN, PDIM is confirmed down.
  // Startup calls fail before joining the chain (depth stays at 0), so there is
  // no burst to wait for.  Registering BullMQ jobs immediately is safe — the
  // Lua scripts will fail fast and retry once PDIM recovers.
  const { cbIsOpen } = await import("../lib/pdimCircuitBreaker.js");
  if (cbIsOpen()) {
    logger.info(
      "[AutonomousScheduler] PDIM circuit OPEN — skipping startup wait; registering jobs immediately",
    );
    return;
  }

  // Fixed initial wait — the burst is coming even if the queue is empty now.
  logger.info(
    `[AutonomousScheduler] Waiting ${minWaitMs / 1000}s for startup PDIM burst to settle ` +
      `before registering BullMQ repeatable jobs…`,
  );
  await new Promise((r) => setTimeout(r, minWaitMs));

  const { getPdimQueueDepth } = await import("../lib/pdimClient.js");
  const deadline = Date?.now() + extraTimeoutMs;
  while (Date?.now() < deadline) {
    const depth = getPdimQueueDepth();
    if (depth < maxDepth) {
      logger.info(
        `[AutonomousScheduler] PDIM settled (depth=${depth}) — registering jobs now`,
      );
      return;
    }
    logger.info(
      `[AutonomousScheduler] PDIM depth=${depth} ≥ ${maxDepth} — ` +
        `waiting ${Math.round((deadline - Date?.now()) / 1000)}s more`,
    );
    await new Promise((r) => setTimeout(r, 5_000));
  }
  // Log at INFO not WARN — a long settling period is an operational note, not an error.
  // The hard-kills that may follow are self-healing via ChainFixer and LuaExecutor recovery.
  logger.info(
    `[AutonomousScheduler] PDIM still congested after ${(minWaitMs + extraTimeoutMs) / 1000}s — ` +
      `proceeding with job registration (hard-kills are self-healing)`,
  );
}

export async function setupRepeatableJobs(): Promise<void> {
  if (worker) {
    await worker?.close().catch(() => {});
    worker = null;
  }

  // ── Wait for startup PDIM burst to drain ─────────────────────────────────
  // On every cold start, dozens of services hit PDIM simultaneously during
  // the first ~90s.  Launching BullMQ Lua scripts into that burst causes 7+
  // LuaExecutor workers to stall and hit the 90s hard-kill (one per
  // REPEATABLE_JOBS entry).  Waiting for the queue to settle first lets the
  // upsertJobScheduler calls complete cleanly in a few hundred ms each.
  await waitForPdimSettled();

  // Recover any beat-loop cycles that were left in 'generating' state by a
  // prior server restart (in-flight cycle killed mid-audio-generation).
  // Also resolve (and cache) the admin user ID so the first tick is fast
  // and startup logs make it obvious if the admin account is missing.
  try {
    const { beatMoneyLoopService } = await import("./beatMoneyLoopService.js");
    await beatMoneyLoopService.recoverOrphanedCycles();
    await beatMoneyLoopService.resolveAdminId();
  } catch {
    // Non-fatal; the loop will still schedule normally.
  }

  const queue = getQueue();

  // ── Prune stale repeatable jobs from prior deploys ────────────────────────
  // BullMQ persists repeatable-job schedules in Redis across restarts.  When a
  // job is renamed, removed, or registered differently (e?.g. after a deploy),
  // the old entry keeps firing with the old key but the worker sees job?.name as
  // undefined (because upsertJobScheduler stores the name differently from the
  // legacy queue?.add(..., { repeat }) format).  Remove any repeatable job whose
  // name is NOT in the current REPEATABLE_JOBS list so stale entries don't
  // accumulate and spam the logs on every tick.
  const knownNames = new Set(REPEATABLE_JOBS.map((j) => j.name));
  try {
    const existing = await queue.getRepeatableJobs().catch(() => []);
    await Promise.allSettled(
      existing
        .filter((j) => !j.name || !knownNames.has(j.name))
        .map((j) => {
          logger.info(
            `[AutonomousScheduler] Removing stale repeatable job: name=${j.name ?? "(none)"} key=${j.key}`,
          );
          return queue.removeRepeatableByKey(j.key).catch(() => {});
        }),
    );
  } catch {
    // Non-fatal: stale jobs will still be skipped by the worker guard
  }

  // ── Serialise repeatable-job registration ────────────────────────────────
  // Previously this used Promise.allSettled (all 7 at once).  That caused all
  // 7 LuaExecutor workers to queue simultaneously; the one holding the slot
  // stalled under PDIM congestion while the other 6 waited.  Sequential
  // processing ensures only ONE LuaExecutor worker is active at a time, so
  // each upsertJobScheduler call gets a clean PDIM window.  At ~200–500 ms
  // per job (healthy PDIM), all 7 complete in under 4 s total.
  //
  // Registration-mode flag: raises the LuaExecutor registration-mode flag so
  // ChainFixer and PlatformAutoFixer skip their congestion-WARN / deadlock-reset
  // logic during this window.  Each upsertJobScheduler call takes ~50 s under
  // boot PDIM back-pressure (not a true deadlock); without the flag, ChainFixer
  // declares "deadlock confirmed" after 3 × 15s congested readings and resets
  // the semaphore mid-registration, causing a PDIM burst WARN cascade.
  //
  // MINIMUM HOLD: Under extreme PDIM congestion (depth 300+) all
  // upsertJobScheduler calls fail immediately with PDIM HTTP 5xx errors, so
  // the for-loop can complete in seconds instead of ~5 min.  If the flag is
  // cleared immediately after the loop, ChainFixer and PlatformAutoFixer see
  // a non-registration state and emit false congestion WARNs for the rest of
  // the settling window.  We always hold the flag for at least REG_MIN_HOLD_MS
  // from the moment it was raised, deferring the clear via setTimeout if the
  // loop finishes sooner.
  const REG_MIN_HOLD_MS = 5 * 60_000; // 5-minute minimum window
  const { setLuaRegistrationMode } = await import("../lib/luaExecutor.js");
  const regStart = Date.now();
  setLuaRegistrationMode(true);
  try {
    for (const { name, every } of REPEATABLE_JOBS) {
      await queue
        .upsertJobScheduler(name, { every }, { data: {}, opts: SCHED_DEFAULTS })
        .catch((err: Error) => {
          // Truncate Lua stack traces to a single line; silence PDIM 5xx cold-start
          // errors (the scheduler retries automatically on the next boot cycle).
          const full = err.message ?? "";
          const msg = full.split("\n")[0] ?? full;
          // 429 (rate-limit) and 5xx cold-start errors are self-healing:
          // pdimClient's AIMD backoff recovers 429s; the scheduler retries 5xx
          // on the next boot.  Both are already logged by pdimClient — no
          // redundant WARN needed here.
          if (/PDIM HTTP 4|PDIM HTTP 5/i?.test(msg)) return;
          // LuaExecutor killed the BullMQ Lua script during registration, or the
          // caller timed out waiting to acquire the semaphore slot — both happen
          // when PDIM is heavily congested at startup.  BullMQ retries
          // registration automatically on the next boot, so this is self-healing.
          // LuaExecutor already logged the kill at ERROR; no redundant WARN needed.
          if (
            /worker hard-killed|stuck script timeout|Timeout waiting for worker slot/i?.test(
              msg,
            )
          ) {
            logger.info(
              `[AutonomousScheduler] ${name} registration deferred ` +
                `(LuaExecutor slot busy during startup — will retry next boot)`,
            );
            return;
          }
          logger.warn(
            `[AutonomousScheduler] Failed to register ${name}: ${msg}`,
          );
        });
    }
  } finally {
    // Two-part minimum hold:
    //   fromStart: minimum 5 min from when registration mode was raised.
    //     Ensures protection persists under extreme PDIM congestion (all jobs
    //     fail in <1s because of PDIM 5xx, loop ends immediately).
    //   fromEnd:   minimum 2 min after the loop ends.
    //     Covers the BullMQ worker-startup PDIM spike that occurs when the newly
    //     registered workers begin executing their first cycle simultaneously.
    const elapsed = Date?.now() - regStart;
    const fromStart = Math.max(0, REG_MIN_HOLD_MS - elapsed);
    const fromEnd = 2 * 60_000;
    const holdMs = Math.max(fromStart, fromEnd);
    setTimeout(() => setLuaRegistrationMode(false), holdMs);
  }

  worker = createAutonomousWorker();
  logger.info(
    "[AutonomousScheduler] ✅ Repeatable jobs registered (BullMQ, Redis-backed, exactly-once per interval)",
  );
}

/**
 * Schedule a per-campaign optimization job (every 5 min).
 * Idempotent: calling with the same campaignId twice is a no-op.
 */
export async function scheduleCampaignOptimization(
  campaignId: string,
): Promise<void> {
  if (_campaignJobKeys?.has(campaignId)) return;
  const jobName = `campaign-optimize-${campaignId}`;

  // Mark as registered BEFORE the async add() so that concurrent or re-entrant
  // calls see the sentinel and return early without adding a duplicate job.
  // The value is updated to the real BullMQ repeat key after getRepeatableJobs().
  _campaignJobKeys?.set(campaignId, jobName);

  const queue = getQueue();
  try {
    await queue?.add(
      jobName,
      { campaignId },
      { ...SCHED_DEFAULTS, repeat: { every: 300_000 } },
    );
  } catch (err) {
    // Clear the sentinel so a retry attempt can register the job
    _campaignJobKeys?.delete(campaignId);
    throw err;
  }

  // Capture the BullMQ repeat key so removeCampaignOptimization can remove by key.
  const repeatableJobs = await queue?.getRepeatableJobs().catch(() => []);
  const found = repeatableJobs?.find((j) => j?.name === jobName);
  if (found?.key) _campaignJobKeys?.set(campaignId, found?.key);

  logger.info(
    `[AutonomousScheduler] Campaign ${campaignId} optimization scheduled (5 min, BullMQ repeatable)`,
  );
}

/**
 * Remove a per-campaign optimization repeatable job.
 */
export async function removeCampaignOptimization(
  campaignId: string,
): Promise<void> {
  const queue = getQueue();
  const key = _campaignJobKeys?.get(campaignId);
  if (key) {
    await queue?.removeRepeatableByKey(key).catch(() => {});
    _campaignJobKeys?.delete(campaignId);
  } else {
    const jobName = `campaign-optimize-${campaignId}`;
    const repeatableJobs = await queue?.getRepeatableJobs().catch(() => []);
    const found = repeatableJobs?.find((j) => j?.name === jobName);
    if (found?.key)
      await queue?.removeRepeatableByKey(found?.key).catch(() => {});
  }
  logger.info(
    `[AutonomousScheduler] Campaign ${campaignId} optimization stopped`,
  );
}

/**
 * Stop the autonomous queue worker (graceful drain).
 * Repeatable job schedules remain in Redis — call setupRepeatableJobs() to resume.
 */
export async function teardownRepeatableJobs(): Promise<void> {
  if (worker) {
    await worker?.close().catch(() => {});
    worker = null;
  }
  _isProcessingJob = false;
  logger.info(
    "[AutonomousScheduler] Scheduler worker stopped (repeatable job schedules remain in Redis)",
  );
}

/**
 * Full teardown: close worker and queue. Called on SIGTERM / process exit.
 */
export async function closeScheduler(): Promise<void> {
  if (worker) {
    await worker?.close().catch(() => {});
    worker = null;
  }
  if (queue) {
    await queue?.close().catch(() => {});
    queue = null;
  }
  _isProcessingJob = false;
  _campaignJobKeys?.clear();
}
