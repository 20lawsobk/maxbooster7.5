/**
 * Admission Control — Application-Level Backpressure
 *
 * Tracks the number of in-flight API requests using a Redis atomic counter
 * (INCR / DECR). When concurrency exceeds MAX_CONCURRENT_REQUESTS, new
 * requests receive a 503 with a Retry-After header instead of being queued
 * up and overloading the database.
 *
 * This is the application-level equivalent of an API Gateway's concurrency
 * limit and provides protection before write-scaling infrastructure is in
 * place.
 *
 * Falls back gracefully to an in-process counter when Redis is unavailable.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';

const COUNTER_KEY = 'api:inflight';
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? '5000', 10);
const RETRY_AFTER_SECONDS = 5;

// When Redis is unavailable, each replica falls back to independent per-process tracking.
// VM Reserve runs a single Node.js process (no internal cluster), so the per-process
// limit equals the global limit. Default of '1' is correct for VM Reserve; set
// CLUSTER_WORKERS env var to the actual worker count only if you add Node.js clustering.
const CLUSTER_WORKERS_PER_REPLICA = parseInt(process.env.CLUSTER_WORKERS ?? '1', 10);
const DEGRADED_PER_PROCESS_LIMIT = Math.max(
  50,
  Math.ceil(MAX_CONCURRENT_REQUESTS / CLUSTER_WORKERS_PER_REPLICA)
);

const isProduction = () =>
  process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

let _inProcess = 0;
let _redisFailed = false;

async function increment(): Promise<number> {
  try {
    const redis = getRedisClient();
    const count = await redis.incr(COUNTER_KEY);
    await redis.expire(COUNTER_KEY, 60);
    _redisFailed = false;
    return count;
  } catch {
    if (!_redisFailed) {
      logger.warn(
        `[AdmissionControl] Redis unavailable — degraded mode, per-process limit: ${DEGRADED_PER_PROCESS_LIMIT}`
      );
      _redisFailed = true;
    }
    return ++_inProcess;
  }
}

async function decrement(): Promise<void> {
  try {
    const redis = getRedisClient();
    const v = await redis.decr(COUNTER_KEY);
    if (v < 0) await redis.set(COUNTER_KEY, '0');
    _redisFailed = false;
  } catch {
    if (_inProcess > 0) _inProcess--;
  }
}

export async function admissionControl(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isProduction()) {
    return next();
  }

  const current = await increment();
  const effectiveLimit = _redisFailed ? DEGRADED_PER_PROCESS_LIMIT : MAX_CONCURRENT_REQUESTS;

  if (current > effectiveLimit) {
    await decrement();
    logger.warn(
      `[AdmissionControl] Shedding request — inflight: ${current}/${effectiveLimit}` +
      (_redisFailed ? ` (degraded/per-process)` : ` (global)`) +
      ` path: ${req.path}`
    );
    res.setHeader('Retry-After', String(RETRY_AFTER_SECONDS));
    res.status(503).json({
      error: 'Server is under high load. Please retry in a few seconds.',
      retryAfter: RETRY_AFTER_SECONDS,
    });
    return;
  }

  let decremented = false;
  const safeDecrement = () => {
    if (decremented) return;
    decremented = true;
    decrement().catch(() => {});
  };

  res.on('finish', safeDecrement);
  res.on('close', safeDecrement);

  next();
}
