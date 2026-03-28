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
 * PDIM is always reachable — no per-process fallback.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisClient.js';

const COUNTER_KEY = 'api:inflight';
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? '50000', 10);
const RETRY_AFTER_SECONDS = 5;

const isProduction = () =>
  process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;

async function increment(): Promise<number> {
  const redis = getRedisClient();
  const count = await redis.incr(COUNTER_KEY);
  // Fire-and-forget expire — don't block the request for this housekeeping op
  redis.expire(COUNTER_KEY, 60).catch(() => {});
  return count;
}

async function decrement(): Promise<void> {
  const redis = getRedisClient();
  const v = await redis.decr(COUNTER_KEY);
  if (v < 0) redis.set(COUNTER_KEY, '0').catch(() => {});
}

export async function admissionControl(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isProduction()) {
    return next();
  }

  let current: number;
  try {
    current = await increment();
  } catch (err) {
    return next(err);
  }

  if (current > MAX_CONCURRENT_REQUESTS) {
    await decrement().catch(() => {});
    logger.warn(
      `[AdmissionControl] Shedding request — inflight: ${current}/${MAX_CONCURRENT_REQUESTS} (global) path: ${req.path}`
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
