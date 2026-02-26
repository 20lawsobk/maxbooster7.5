/**
 * Feature Event Write Buffer
 *
 * Buffers high-frequency feature tracking events in Redis and flushes them to
 * PostgreSQL in batches via the BullMQ retention queue. This cuts write load
 * by ~10x compared to a direct INSERT on every event.
 *
 * Write path:  POST /api/retention/feature-event
 *              → featureEventBuffer.push()
 *              → RPUSH feat:buf (Redis list)
 *
 * Flush path:  BullMQ worker job 'feature-event-flush'
 *              → featureEventBuffer.flush()
 *              → LRANGE + LTRIM + bulk INSERT
 */

import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';
import { db } from '../db.js';
import { featureEvents } from '@shared/schema';

const BUFFER_KEY = 'feat:buf';
const FLUSH_BATCH_SIZE = 500;

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
export async function pushFeatureEvent(payload: FeatureEventPayload): Promise<void> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    // Redis not available — write directly
  }

  if (!redis) {
    await insertDirect([payload]);
    return;
  }

  try {
    await redis.rpush(BUFFER_KEY, JSON.stringify(payload));
  } catch (err) {
    logger.warn('[FeatureEventBuffer] Redis push failed, writing directly:', err);
    await insertDirect([payload]);
  }
}

/**
 * Flush up to FLUSH_BATCH_SIZE events from the Redis buffer into PostgreSQL.
 * Returns the number of events inserted.
 * Safe to call concurrently — uses LRANGE + LTRIM atomically via Lua.
 */
export async function flushFeatureEvents(): Promise<number> {
  let redis: ReturnType<typeof getRedisClient> | null = null;
  try {
    redis = getRedisClient();
  } catch {
    return 0;
  }
  if (!redis) return 0;

  const lua = `
    local items = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
    if #items > 0 then
      redis.call('LTRIM', KEYS[1], ARGV[1], -1)
    end
    return items
  `;

  let raw: string[];
  try {
    raw = (await redis.eval(lua, 1, BUFFER_KEY, String(FLUSH_BATCH_SIZE))) as string[];
  } catch (err) {
    logger.error('[FeatureEventBuffer] Flush Lua script failed:', err);
    return 0;
  }

  if (!raw || raw.length === 0) return 0;

  const payloads: FeatureEventPayload[] = [];
  for (const item of raw) {
    try {
      payloads.push(JSON.parse(item) as FeatureEventPayload);
    } catch {
      logger.warn('[FeatureEventBuffer] Skipping malformed event payload');
    }
  }

  if (payloads.length === 0) return 0;

  try {
    await insertDirect(payloads);
    logger.info(`[FeatureEventBuffer] Flushed ${payloads.length} events to DB`);
    return payloads.length;
  } catch (insertErr) {
    logger.error('[FeatureEventBuffer] Bulk insert failed, re-queuing events:', insertErr);
    // Re-push back to the front of the list so they are not lost.
    // Use individual LPUSH calls (not pipeline) so a partial Redis failure still saves some events.
    let requeued = 0;
    for (let i = payloads.length - 1; i >= 0; i--) {
      try {
        await redis.lpush(BUFFER_KEY, JSON.stringify(payloads[i]));
        requeued++;
      } catch (requeueErr) {
        logger.error(`[FeatureEventBuffer] Failed to re-queue event ${i} — event may be lost:`, requeueErr);
      }
    }
    logger.info(`[FeatureEventBuffer] Re-queued ${requeued}/${payloads.length} events after insert failure`);
    throw insertErr;
  }
}

/**
 * Returns how many events are currently buffered.
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
    return await redis.llen(BUFFER_KEY);
  } catch {
    return 0;
  }
}

async function insertDirect(payloads: FeatureEventPayload[]): Promise<void> {
  const rows = payloads.map(p => ({
    userId: p.userId,
    featureName: p.featureName,
    action: p.action,
    metadata: p.metadata ?? null,
  }));
  await db.insert(featureEvents).values(rows);
}
