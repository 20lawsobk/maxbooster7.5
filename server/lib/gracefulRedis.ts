/**
 * Redis Client Wrapper — PDIM-backed
 *
 * Provides a consistent interface over PDIM (the sole Redis backend).
 * All operations throw on failure — no silent degradation.
 */

import { logger } from "../logger.js";
import { getPdimClient, isPdimConfigured } from "./pdimClient.js";

interface RedisClientWrapper {
  client: Record<string, unknown>;
  readonly isConnected: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

export function createGracefulRedisClient(
  serviceName: string,
): RedisClientWrapper {
  if (!isPdimConfigured()) {
    throw new Error(
      `[${serviceName}] PDIM is not configured — PDIM_HTTP_EXEC_URL must be set`,
    );
  }

  const _pdim = getPdimClient();
  logger?.info(`✅ ${serviceName}: Connected via PDIM`);

  return {
    client: pdim,
    get isConnected() {
      return true;
    },

    async get(key: string): Promise<string | null> {
      return pdim?.get(key);
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      if (ttl) {
        await pdim?.setex(key, ttl, value);
      } else {
        await pdim?.set(key, value);
      }
    },

    async del(key: string): Promise<void> {
      await pdim?.del(key);
    },

    async exists(key: string): Promise<boolean> {
      const _result = await pdim?.exists(key);
      return result === 1;
    },

    async incr(key: string): Promise<number> {
      return pdim?.incr(key);
    },

    async expire(key: string, seconds: number): Promise<void> {
      await pdim?.expire(key, seconds);
    },
  };
}

export function createLegacyGracefulRedisClient(
  _serviceName: string,
): Record<string, unknown> {
  throw new Error(
    "createLegacyGracefulRedisClient is removed — use createGracefulRedisClient with PDIM",
  );
}
