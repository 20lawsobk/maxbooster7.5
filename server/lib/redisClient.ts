/**
 * Redis Client — PDIM-backed
 *
 * Max Booster uses PDIM as its sole Redis-compatible backend.
 * All Redis operations (including BullMQ) route through the PDIM HTTP exec endpoint.
 */

import { logger } from "../logger.js";
import { getPdimClient, isPdimConfigured } from "./pdimClient.js";

type RedisClient = ReturnType<typeof getPdimClient>;

let _redis: RedisClient | null = null;

/**
 * Returns the singleton PDIM client for standard Redis operations.
 */
export function getRedisClient(): RedisClient {
  if (!isPdimConfigured()) {
    throw new Error(
      "[Redis] PDIM is not configured — PDIM_HTTP_EXEC_URL must be set",
    );
  }
  if (!_redis) {
    logger.info(
      "[Redis] PDIM active — routing all Redis operations through PDIM",
    );
    _redis = getPdimClient();
  }
  return _redis;
}

/**
 * Returns a fresh PDIM connection for BullMQ.
 * BullMQ requires a dedicated connection for its blocking commands.
 * The LuaExecutor (wasmoon + Worker threads) runs BullMQ's Lua scripts
 * locally while dispatching individual Redis commands to PDIM over HTTP.
 */
export function newBullMQRedisConnection(): RedisClient {
  if (!isPdimConfigured()) {
    throw new Error(
      "[Redis/BullMQ] PDIM is not configured — PDIM_HTTP_EXEC_URL must be set",
    );
  }
  logger.info(
    "[Redis/BullMQ] PDIM active — BullMQ using PDIM via wasmoon LuaExecutor",
  );
  return getPdimClient().duplicate() as unknown as RedisClient;
}

export async function closeRedisClient(): Promise<void> {
  logger.info(
    "[Redis] PDIM manages its own lifecycle — no shutdown action needed",
  );
  _redis = null;
}
