/**
 * Feature Event Write Buffer — At-Least-Once Delivery
 *
 * Buffers high-frequency feature tracking events in Redis and flushes them to
 * PostgreSQL in bulk batches via BullMQ. Upgraded from at-most-once (LRANGE+LTRIM)
 * to at-least-once using a per-batch processing key with TTL crash recovery.
 *
 * Write path:  POST /api/retention/feature-event
 *              → pushFeatureEvent()
 *              → RPUSH feat:buf
 *
 * Flush path:  BullMQ 'feature-event-flush' job
 *              → flushFeatureEvents()
 *              → Lua: copy batch to feat:processing:{id} + LTRIM feat:buf (atomic)
 *              → bulk INSERT to PostgreSQL
 *              → DEL feat:processing:{id} on success
 *              → LPUSH items back to feat:buf on failure + DEL feat:processing:{id}
 *
 * Crash recovery:
 *              → recoverStaleProcessingBatches() on server startup
 *              → Scans feat:processing:* keys, re-queues items to feat:buf, deletes stale keys
 */

import { logger } from "../logger.js";
import { getRedisClient } from "../lib/redisClient.js";
import { db } from "../db.js";
import { featureEvents } from "@shared/schema";
import crypto from "crypto";

const BUFFER_KEY = "feat:buf";
const PROCESSING_PREFIX = "feat:processing:";
const FLUSH_BATCH_SIZE = 500;
const PROCESSING_TTL_SECONDS = 300;

export interface FeatureEventPayload {
  userId: number;
  featureName: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Push a single event onto the Redis buffer.
 * Falls back to direct DB insert when Redis is unavailable.
 */
export async function pushFeatureEvent(
  payload: FeatureEventPayload,
): Promise<void> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    // Redis not available
  }

  if (!redis) {
    await insertDirect([payload]);
    return;
  }

  try {
    await redis?.rpush(BUFFER_KEY, JSON.stringify(payload));
  } catch (err) {
    logger.warn(
      { err: err },
      "[FeatureEventBuffer] Redis push failed, writing directly:",
    );
    await insertDirect([payload]);
  }
}

/**
 * Flush up to FLUSH_BATCH_SIZE events from the Redis buffer into PostgreSQL.
 * Uses at-least-once delivery: items are moved to a processing key before being
 * removed from the buffer. On failure, items are restored to the buffer.
 *
 * Returns number of events successfully inserted.
 */
export async function flushFeatureEvents(): Promise<number> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    return 0;
  }
  if (!redis) return 0;

  const batchId = crypto?.randomBytes(6).toString("hex");
  const processingKey = `${PROCESSING_PREFIX}${batchId}`;

  // Atomic Lua: copy batch to processing key (with TTL), trim buffer
  const fetchLua = `
    local n = tonumber(ARGV[1])
    local ttl = tonumber(ARGV[2])
    local items = redis.call('LRANGE', KEYS[1], 0, n - 1)
    if #items > 0 then
      for i, v in ipairs(items) do
        redis.call('RPUSH', KEYS[2], v)
      end
      redis.call('EXPIRE', KEYS[2], ttl)
      redis.call('LTRIM', KEYS[1], n, -1)
    end
    return items
  `;

  let raw: string[];
  try {
    raw = (await redis?.eval(
      fetchLua,
      2,
      BUFFER_KEY,
      processingKey,
      String(FLUSH_BATCH_SIZE),
      String(PROCESSING_TTL_SECONDS),
    )) as string[];
  } catch (err) {
    logger.warn({ err: err }, "[FeatureEventBuffer] Fetch Lua script failed:");
    return 0;
  }

  if (!raw || raw?.length === 0) return 0;

  const payloads: FeatureEventPayload[] = [];
  for (const item of raw) {
    try {
      payloads?.push(JSON.parse(item) as FeatureEventPayload);
    } catch {
      logger.warn("[FeatureEventBuffer] Skipping malformed event payload");
    }
  }

  if (payloads?.length === 0) {
    await redis?.del(processingKey).catch(() => {});
    return 0;
  }

  try {
    await insertDirect(payloads);
    // Confirm delivery: remove the processing key
    await redis?.del(processingKey).catch((err) => {
      logger.warn(
        { err: err },
        "[FeatureEventBuffer] Failed to delete processing key (harmless — TTL will clean up):",
      );
    });
    logger.info(
      `[FeatureEventBuffer] Flushed ${payloads?.length} events (batch ${batchId})`,
    );
    return payloads?.length;
  } catch (insertErr) {
    logger.warn({ detail: insertErr }, `[FeatureEventBuffer] Insert failed for batch ${batchId}, restoring to buffer:`,
    );
    // Restore items to the front of the buffer (reverse order to preserve sequence)
    let restored = 0;
    for (let i = payloads?.length - 1; i >= 0; i--) {
      try {
        await redis?.lpush(BUFFER_KEY, JSON.stringify(payloads[i]));
        restored++;
      } catch (restoreErr) {
        logger.warn({ detail: restoreErr }, `[FeatureEventBuffer] Lost event during restore (index ${i}):`,
        );
      }
    }
    await redis?.del(processingKey).catch(() => {});
    logger.info(
      `[FeatureEventBuffer] Restored ${restored}/${payloads?.length} events after insert failure`,
    );
    throw insertErr;
  }
}

/**
 * Crash recovery: scan for stale feat:processing:* keys and move their items
 * back to feat:buf. Call once at server startup.
 *
 * A processing key is "stale" if it exists but still has a TTL (meaning the
 * process that created it crashed before finishing). We recover all of them.
 */
export async function recoverStaleProcessingBatches(): Promise<void> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    return;
  }
  if (!redis) return;

  try {
    let cursor = "0";
    let recovered = 0;

    do {
      const [nextCursor, keys] = await redis?.scan(
        cursor,
        "MATCH",
        `${PROCESSING_PREFIX}*`,
        "COUNT",
        "100",
      );
      cursor = nextCursor;

      for (const key of keys) {
        try {
          const items = await redis?.lrange(key, 0, -1);
          if (items?.length > 0) {
            const pipeline = redis?.pipeline();
            for (let i = items?.length - 1; i >= 0; i--) {
              pipeline?.lpush(BUFFER_KEY, items[i]);
            }
            pipeline?.del(key);
            await pipeline?.exec();
            recovered += items?.length;
            logger.info(
              `[FeatureEventBuffer] Recovered ${items?.length} events from stale batch ${key}`,
            );
          } else {
            await redis?.del(key);
          }
        } catch (err) {
          const msg = err instanceof Error ? err?.message : String(err);
          logger.warn(
            `[FeatureEventBuffer] Failed to recover stale batch ${key}: ${msg}`,
          );
        }
      }
    } while (cursor !== "0");

    if (recovered > 0) {
      logger.warn(
        `[FeatureEventBuffer] Crash recovery: restored ${recovered} events to buffer`,
      );
    }
  } catch (err) {
    // PDIM outages cause scan failures at startup — expected and self-healing.
    // Log at WARN (not ERROR) so it doesn't pollute error dashboards.
    const msg = err instanceof Error ? err?.message : String(err);
    logger.info(
      `[FeatureEventBuffer] Crash recovery scan skipped (PDIM unavailable): ${msg}`,
    );
  }
}

/**
 * Returns how many events are currently buffered (excludes in-flight processing batches).
 */
export async function bufferDepth(): Promise<number> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    return 0;
  }
  if (!redis) return 0;
  try {
    return await redis?.llen(BUFFER_KEY);
  } catch {
    return 0;
  }
}

async function insertDirect(payloads: FeatureEventPayload[]): Promise<void> {
  const rows = payloads?.map((p) => ({
    userId: p.userId,
    featureName: p.featureName,
    action: p.action,
    metadata: p.metadata ?? null,
  }));
  await db?.insert(featureEvents).values(rows);
}
