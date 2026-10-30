/**
 * Redis Client — ioredis (local) with PDIM HTTP fallback
 *
 * Priority order:
 *   1. Native Redis — when REDIS_URL starts with redis:// or rediss://
 *      (e.g. redis://localhost:6379 after local redis-server is added to nix)
 *   2. PDIM HTTP adapter — when PDIM_HTTP_EXEC_URL + PDIM_BEARER_TOKEN are set
 *      and the circuit is CLOSED (PDIM is up and reachable)
 *
 * BullMQ always uses a dedicated ioredis connection (maxRetriesPerRequest: null)
 * which is required for blocking commands (BZPOPMIN etc).
 */

import Redis from "ioredis";
import { logger } from "../logger.js";
import { getPdimClient, isPdimConfigured } from "./pdimClient.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNativeRedisUrl(): string | null {
  const url = process.env.REDIS_URL || process.env.NATIVE_REDIS_URL || "";
  if (url.startsWith("redis://") || url.startsWith("rediss://")) return url;
  return null;
}

function hasNativeRedis(): boolean {
  return getNativeRedisUrl() !== null;
}

// ── Singleton native Redis for general use ───────────────────────────────────

let _nativeRedis: Redis | null = null;

function getNativeRedisClient(): Redis {
  if (_nativeRedis) return _nativeRedis;
  const url = getNativeRedisUrl() || "redis://localhost:6379";
  logger.info(`[Redis] Connecting to native Redis at ${url.replace(/\/\/.*@/, "//<creds>@")}`);
  _nativeRedis = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    lazyConnect: false,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  });
  _nativeRedis.on("error", (err: Error) => {
    logger.warn(`[Redis] ioredis error: ${err.message}`);
  });
  _nativeRedis.on("connect", () => logger.info("[Redis] ioredis connected"));
  _nativeRedis.on("reconnecting", () => logger.warn("[Redis] ioredis reconnecting…"));
  return _nativeRedis;
}

// ── Singleton PDIM client for general use ────────────────────────────────────

let _pdimRedis: ReturnType<typeof getPdimClient> | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the singleton Redis client.
 * Prefers native ioredis; falls back to PDIM when native Redis is unavailable.
 */
export function getRedisClient(): Redis | ReturnType<typeof getPdimClient> {
  if (hasNativeRedis()) {
    return getNativeRedisClient();
  }
  if (!isPdimConfigured()) {
    // Fail explicitly: no local redis-server exists in the self-contained
    // boot, so a localhost client would retry-loop forever without serving.
    throw new Error(
      "[Redis] Neither native REDIS_URL nor PDIM configured (PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN required) — refusing localhost fallback",
    );
  }
  if (!_pdimRedis) {
    logger.info("[Redis] PDIM active — routing Redis operations through PDIM");
    _pdimRedis = getPdimClient();
  }
  return _pdimRedis;
}

/**
 * Returns a fresh Redis connection for BullMQ.
 * BullMQ requires a dedicated connection with maxRetriesPerRequest: null
 * for blocking commands (BZPOPMIN, BRPOPLPUSH, etc.).
 */
export function newBullMQRedisConnection(): Redis | ReturnType<typeof getPdimClient> {
  if (hasNativeRedis()) {
    const url = getNativeRedisUrl() || "redis://localhost:6379";
    logger.info("[Redis/BullMQ] Using native ioredis for BullMQ");
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: true,
      retryStrategy: (times: number) => Math.min(times * 500, 10_000),
    });
  }
  if (!isPdimConfigured()) {
    // Fail explicitly: Max Booster is self-contained — PDIM is the queue
    // backend and no local redis-server exists to silently absorb this.
    // A localhost fallback here would retry-loop forever and retain jobs
    // in an offline queue that can never flush.
    throw new Error(
      "[Redis/BullMQ] PDIM is not configured (PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN required) — refusing localhost fallback; queues need the internal PDIM subsystem",
    );
  }
  logger.info("[Redis/BullMQ] PDIM active — BullMQ using PDIM via wasmoon LuaExecutor");
  return getPdimClient().duplicate() as unknown as Redis;
}

export async function closeRedisClient(): Promise<void> {
  if (_nativeRedis) {
    await _nativeRedis.quit().catch(() => {});
    _nativeRedis = null;
  }
  logger.info("[Redis] Client closed");
  _pdimRedis = null;
}
