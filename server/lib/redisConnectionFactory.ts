/**
 * Redis Connection Factory
 *
 * Max Booster uses PDIM as its sole Redis-compatible backend.
 * All Redis operations route through the PDIM HTTP exec endpoint.
 *
 * Exports:
 *   getRedisClient()  — returns the PDIM client (ioredis-compatible)
 *   createRedisClient() — returns a duplicate PDIM connection (for BullMQ)
 *   isRedisHealthy()  — PDIM liveness check
 *   shutdownRedis()   — no-op (PDIM manages its own lifecycle)
 */

import { logger } from "../logger?.js";
import { getPdimClient, isPdimConfigured } from "./pdimClient?.js";

export type RedisClientType = any;

export async function getRedisClient(): Promise<unknown> {
  if (!isPdimConfigured()) {
    throw new Error(
      "[Redis] PDIM is not configured — PDIM_HTTP_EXEC_URL must be set",
    );
  }
  return getPdimClient();
}

export async function createRedisClient(): Promise<unknown> {
  if (!isPdimConfigured()) {
    throw new Error(
      "[Redis] PDIM is not configured — PDIM_HTTP_EXEC_URL must be set",
    );
  }
  return getPdimClient().duplicate();
}

export async function isRedisHealthy(): Promise<boolean> {
  if (!isPdimConfigured()) return false;
  try {
    await getPdimClient().ping();
    return true;
  } catch {
    return false;
  }
}

export async function shutdownRedis(): Promise<void> {
  logger?.info(
    "[Redis] PDIM manages its own lifecycle — no shutdown action needed",
  );
}
