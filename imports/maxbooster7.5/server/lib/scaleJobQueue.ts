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
 * connection pool exhaustion. Failed jobs are retained for explicit review;
 * startup never discards waiting or active work.
 */

import { Queue, Worker, Job, UnrecoverableError } from "bullmq";
import { newBullMQRedisConnection } from "./redisClient.js";
import { logger } from "../logger.js";
import { customerHealthScoreService } from "../services/customerHealthScoreService.js";
import { dunningService } from "../services/dunningService.js";
import { reEngagementService } from "../services/reEngagementService.js";
import { flushFeatureEvents } from "../services/featureEventBuffer.js";

export const RETENTION_QUEUE = "retention-jobs";

/**
 * How many jobs the worker runs in parallel.
 * Capped to 3 to prevent DB connection storms during queue drain.
 * Override with BULLMQ_CONCURRENCY env var.
 */
const WORKER_CONCURRENCY = parseInt(process.env.BULLMQ_CONCURRENCY ?? "3", 10);

/**
 * Job persistence + retry policy.
 * Completed work is removed. Failed records retain their original payload and reason.
 */
const JOB_DEFAULTS = {
  removeOnComplete: true,
  removeOnFail: false,
  attempts: 2,
  backoff: { type: "exponential" as const, delay: 10_000 },
};

let queue: Queue | null = null;

export function getRetentionQueue(): Queue {
  if (queue) return queue;

  const connection = newBullMQRedisConnection();
  queue = new Queue(RETENTION_QUEUE, {
    connection: connection as any,
    defaultJobOptions: JOB_DEFAULTS,
  });
  return queue;
}

export function startRetentionWorker(): Worker {
  const connection = newBullMQRedisConnection();

  // No startup sweep: it cannot safely distinguish another replica's work.
  // The processor owns a job lock, and quarantines malformed work as failed.

  const worker = new Worker(
    RETENTION_QUEUE,
    async (job: Job) => {
      const jobName = job.name || (job.data?.type as string | undefined);
      if (!jobName) {
        // Override legacy per-job auto-removal, preserving payload + failure reason.
        job.opts.removeOnFail = false;
        throw new UnrecoverableError("Quarantined: retention job has no name or type");
      }
      const data = job.data;
      const invalid = !data || typeof data !== "object" || Array.isArray(data) ||
        (jobName === "health-score-batch" &&
          ((data.cursor !== undefined && !(typeof data.cursor === "string" && data.cursor.length > 0) &&
            (!Number.isSafeInteger(data.cursor) || data.cursor < 0)) ||
           (data.batchSize !== undefined && (!Number.isSafeInteger(data.batchSize) || data.batchSize < 1)))) ||
        (jobName === "dunning-process" &&
          data.limit !== undefined && (!Number.isSafeInteger(data.limit) || data.limit < 1));
      if (invalid) {
        job.opts.removeOnFail = false;
        throw new UnrecoverableError("Quarantined: invalid retention job payload");
      }
      logger.info(`[Worker] Processing job ${jobName} id=${job.id}`);

      try {
        switch (jobName) {
          case "health-score-batch": {
            const { cursor = 0, batchSize = 100 } = job.data;
            const nextCursor =
              await customerHealthScoreService.batchComputePaged(
                cursor,
                batchSize,
              );
            if (nextCursor !== null) {
              await getRetentionQueue().add("health-score-batch", {
                cursor: nextCursor,
                batchSize,
              });
            }
            break;
          }

          case "dunning-process": {
            const { limit = 50 } = job.data;
            const processed =
              await dunningService.processPendingStepsPaged(limit);
            logger.info(`[Worker] Dunning processed ${processed} records`);
            break;
          }

          case "re-engagement-batch": {
            await reEngagementService.runDailyCheck();
            break;
          }

          case "feature-event-flush": {
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
              await getRetentionQueue().add("feature-event-flush", {});
              logger.info(
                `[Worker] Feature event buffer still has items — re-queued next flush`,
              );
            }
            logger.info(
              `[Worker] Feature events flushed to DB: ${totalFlushed} in ${iterations} batches`,
            );
            break;
          }

          default:
            job.opts.removeOnFail = false;
            throw new UnrecoverableError(`Quarantined: unknown retention job type ${jobName}`);
        }
      } catch (err) {
        logger.warn({ err: err }, `[Worker] Job ${jobName} failed:`);
        throw err;
      }
    },
    {
      connection: connection as any,
      // Use WORKER_CONCURRENCY (env BULLMQ_CONCURRENCY, default 3) instead of
      // hard-coding 1. All retention job types (health-score, dunning, re-engagement,
      // feature-event-flush) are independent — they read/write disjoint DB tables —
      // so running them concurrently is safe and cuts total wall-clock time.
      concurrency: WORKER_CONCURRENCY,
      runRetryDelay: 30000,
      autorun: false,
      drainDelay: 120_000,
      stalledInterval: 300_000,
      maxStalledCount: 1,
      lockDuration: 600_000,
      limiter: {
        max: WORKER_CONCURRENCY,
        duration: 5_000,
      },
    },
  );

  setImmediate(() => {
    worker.run().catch((err) => {
      logger.warn({ err: err }, "[Worker] Failed to start run loop:");
    });
  });

  worker.on("completed", (job) => {
    // Stale jobs are removed inside the processor — their name is undefined.
    // Suppress the completed log for those (already logged as WARN above).
    if (job.name) logger.info(`[Worker] ✅ ${job.id} (${job.name}) done`);
  });

  worker.on("failed", (job, err) => {
    const msg = err.message ?? "";
    // PDIM 429 during stale-job cleanup is transient and self-healing — BullMQ
    // retries automatically.  Stale jobs have no name (undefined), so this is
    // always a post-restart cleanup race, never a real job failure.
    if (msg.includes("PDIM HTTP 429") || msg.includes("ERR PDIM")) {
      logger.warn(
        `[Worker] ⚠️ ${job!.id} (${job!.name ?? "stale"}) PDIM rate-limit — self-healing: ${msg}`,
      );
    } else {
      logger.warn(`[Worker] ❌ ${job!.id} (${job!.name}) failed: ${msg}`);
    }
  });

  worker.on("error", (err) => {
    const full = err.message ?? "";
    // Strip Lua/Node.js stack traces: only keep the first line of the message
    // so logs stay single-line during PDIM cold-starts (the remainder is
    // always the Lua "stack traceback:" block plus Node.js call frames).
    const msg = full.split("\n")[0] ?? full;
    // "Missing lock for job X. moveToFinished" is a BullMQ-internal race that
    // fires when a slow LuaExecutor round-trip causes the job lock to expire
    // before the Lua moveToFinished script runs.  It is fully self-healing —
    // BullMQ re-queues the job automatically — so log it at WARN, not ERROR.
    // PDIM HTTP 5xx / 429 during post-restart cold-start is also transient
    // and self-healing — log at WARN so it doesn't pollute error dashboards.
    if (
      // Circuit-open rejections are expected during PDIM outages — completely
      // silent: the circuit breaker already logs the open/probe events.
      msg?.includes("PDIM circuit OPEN") ||
      msg?.includes("Circuit OPEN") ||
      // PDIM 500/502 during cold-start: circuit breaker slow-lane already
      // handles these; no additional log needed.
      msg?.includes("PDIM HTTP 500") ||
      msg?.includes("PDIM HTTP 502")
    ) {
      // intentionally silent
    } else if (
      msg?.includes("Missing lock for job") ||
      msg?.includes("moveToFinished") ||
      msg?.includes("PDIM HTTP 429") ||
      msg?.includes("ERR PDIM")
    ) {
      logger.warn(`[Worker] Recoverable (self-healing): ${msg}`);
    } else if (
      // LuaExecutor slot-queue timeout — all MAX_CONCURRENT_WORKERS slots were
      // occupied for 30-55 s; happens under PDIM back-pressure during boot settling
      // and job registration.  The semaphore releases when a running script completes
      // or is hard-killed.  Demoted to INFO: this is always self-healing and is
      // already acknowledged by the autonomousJobScheduler registration handler.
      msg?.includes("Timeout waiting for worker slot")
    ) {
      logger.info(`[Worker] LuaExecutor slot busy (self-healing): ${msg}`);
    } else if (
      // BullMQ lock extension errors — fired when a job processor takes longer
      // than the job's lockDuration (default 30s).  BullMQ re-queues the job
      // automatically; no action needed.
      msg?.includes("Maximum lock renew count reached") ||
      msg?.includes("lock is lost") ||
      msg?.includes("Lock renewal failed") ||
      msg?.includes("lock expired") ||
      // Stalled-job checker race during normal shutdown / restart
      msg?.includes("StalledJobsError") ||
      // Worker thread hard-killed by LuaExecutor timeout — already logged at ERROR
      msg?.includes("worker hard-killed")
    ) {
      logger.warn(`[Worker] BullMQ lock / stall (self-healing): ${msg}`);
    } else if (
      // PDIM timeout/abort errors: the LuaExecutor worker rejects with
      // "ERR The operation was aborted due to timeout" when a redis.call()
      // inside Lua hits PDIM_EXEC_TIMEOUT_MS.  This is already reported and
      // rate-limited by pdimClient._logNetworkError — suppress the full stack
      // trace here so the console doesn't flood with identical Worker frames.
      msg?.includes("aborted due to timeout") ||
      msg?.includes("AbortError") ||
      msg?.includes("TimeoutError") ||
      msg?.includes("operation was aborted")
    ) {
      logger.debug(`[Worker] PDIM timeout (already tracked by pdimClient): ${msg}`);
    } else {
      // Unknown error — log with full error object so we can diagnose it
      logger.warn({ err: err }, `[Worker] Unexpected error: ${msg}`);
    }
  });

  return worker;
}
