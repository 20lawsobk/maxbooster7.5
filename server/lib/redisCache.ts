/**
 * Two-tier response cache for high-traffic public endpoints.
 *
 * L1: In-process Map  — nanosecond reads, per-worker, max 2,000 entries
 * L2: Redis           — ~1ms reads, shared across all 60 workers and 10 replicas
 *
 * Read path:  L1 hit → return immediately
 *             L1 miss → check L2 → populate L1 if found
 *             L2 miss → serve from DB/handler, populate both
 *
 * Write path: invalidatePattern() clears L1 synchronously + enqueues L2 deletion
 *
 * Only use for PUBLIC endpoints (no user-specific data).
 * For user-specific data keep using the per-user in-process apiCache.
 */

import { getRedisClient } from './redisClient.js';
import { logger } from '../logger.js';
import type { Request, Response, NextFunction } from 'express';

const RC_PREFIX = 'rc:';
const L1_MAX   = 2_000;

interface L1Entry {
  body: any;
  statusCode: number;
  etag: string;
  expiresAt: number;
}

const l1: Map<string, L1Entry> = new Map();
let l1PrunedAt = Date.now();

function l1Prune(): void {
  const now = Date.now();
  if (now - l1PrunedAt < 30_000) return;
  for (const [k, v] of l1) {
    if (now > v.expiresAt) l1.delete(k);
  }
  l1PrunedAt = now;
}

function l1Set(key: string, entry: L1Entry): void {
  l1Prune();
  if (l1.size >= L1_MAX) {
    const oldest = l1.keys().next().value;
    if (oldest) l1.delete(oldest);
  }
  l1.set(key, entry);
}

function hashBody(body: any): string {
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return `"${Math.abs(h).toString(36)}"`;
}

async function l2Get(key: string): Promise<L1Entry | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(`${RC_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as L1Entry;
  } catch {
    return null;
  }
}

async function l2Set(key: string, entry: L1Entry, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(`${RC_PREFIX}${key}`, JSON.stringify(entry), 'EX', ttlSeconds);
  } catch {
    // Redis unavailable — L1 still works
  }
}

export async function invalidateSharedCache(pattern: string): Promise<void> {
  const regex = new RegExp(pattern);
  for (const key of l1.keys()) {
    if (regex.test(key)) l1.delete(key);
  }
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${RC_PREFIX}*`);
    const matching = keys.filter(k => regex.test(k.slice(RC_PREFIX.length)));
    if (matching.length) await redis.del(...matching);
  } catch {}
}

interface SharedCacheOptions {
  ttlSeconds?: number;
  keyFn?: (req: Request) => string;
}

/**
 * Middleware for PUBLIC shared endpoints.
 * All users get the same cached response — do NOT use for user-specific data.
 */
export function sharedCache(options: SharedCacheOptions = {}) {
  const { ttlSeconds = 30, keyFn } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') return next();

    const key = keyFn
      ? keyFn(req)
      : `${req.path}:${JSON.stringify(req.query)}`;

    const now = Date.now();

    // L1 — in-process
    const l1Hit = l1.get(key);
    if (l1Hit && now < l1Hit.expiresAt) {
      const clientETag = req.headers['if-none-match'];
      if (clientETag === l1Hit.etag) {
        res.status(304).end();
        return;
      }
      res.setHeader('X-Cache', 'L1-HIT');
      res.setHeader('ETag', l1Hit.etag);
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
      res.status(l1Hit.statusCode).json(l1Hit.body);
      return;
    }

    // L2 — Redis (shared across all workers / replicas)
    const l2Hit = await l2Get(key);
    if (l2Hit && now < l2Hit.expiresAt) {
      l1Set(key, l2Hit);
      const clientETag = req.headers['if-none-match'];
      if (clientETag === l2Hit.etag) {
        res.status(304).end();
        return;
      }
      res.setHeader('X-Cache', 'L2-HIT');
      res.setHeader('ETag', l2Hit.etag);
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
      res.status(l2Hit.statusCode).json(l2Hit.body);
      return;
    }

    // MISS — let the handler run, then cache the response
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const etag = hashBody(body);
        const entry: L1Entry = {
          body,
          statusCode: res.statusCode,
          etag,
          expiresAt: now + ttlSeconds * 1000,
        };
        l1Set(key, entry);
        l2Set(key, entry, ttlSeconds).catch(() => {});
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
      }
      return originalJson(body);
    };

    next();
  };
}
