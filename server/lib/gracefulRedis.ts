/**
 * Graceful Redis Client Wrapper
 *
 * Wraps BoosterState (the recommended KV backend) with a standardised
 * interface that matches the surface area used across service files.
 * Every method silently returns a safe default if the backend is
 * unavailable — the caller never needs to handle Redis outages.
 *
 * createGracefulRedisClient(serviceName) — returns a wrapper whose
 *   `isConnected` getter reports live connectivity.
 *
 * createLegacyGracefulRedisClient() — deprecated shim kept for
 *   compile-compatibility with old service code; always returns stubs.
 */

import { getBoosterStateClient } from './boosterStateClient.js';
import { logger } from '../logger.js';

interface RedisClientWrapper {
  client: any;
  isConnected: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

export function createGracefulRedisClient(serviceName: string): RedisClientWrapper {
  let boosterClient: any = null;
  let initialized = false;

  const ensureClient = async () => {
    if (!initialized) {
      initialized = true;
      try {
        boosterClient = await getBoosterStateClient();
        if (boosterClient) {
          logger.info(`✅ ${serviceName}: Connected to BoosterState`);
        } else {
          logger.warn(`⚠️ ${serviceName}: BoosterState unavailable`);
        }
      } catch {
        logger.warn(`⚠️ ${serviceName}: BoosterState connection failed`);
      }
    }
    return boosterClient;
  };

  return {
    client: null,
    get isConnected() {
      return boosterClient?.isOpen === true;
    },

    async get(key: string): Promise<string | null> {
      const client = await ensureClient();
      if (!client) return null;
      try {
        return await client.get(key);
      } catch {
        return null;
      }
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      const client = await ensureClient();
      if (!client) return;
      try {
        if (ttl) {
          await client.setex(key, ttl, value);
        } else {
          await client.set(key, value);
        }
      } catch (err) {
        logger.warn(`${serviceName}: Redis set failed for key "${key}"`, err);
      }
    },

    async del(key: string): Promise<void> {
      const client = await ensureClient();
      if (!client) return;
      try {
        await client.del(key);
      } catch (err) {
        logger.warn(`${serviceName}: Redis del failed for key "${key}"`, err);
      }
    },

    async exists(key: string): Promise<boolean> {
      const client = await ensureClient();
      if (!client) return false;
      try {
        const result = await client.exists(key);
        return result === 1;
      } catch {
        return false;
      }
    },

    async incr(key: string): Promise<number> {
      const client = await ensureClient();
      if (!client) return 0;
      try {
        return await client.incr(key);
      } catch {
        return 0;
      }
    },

    async expire(key: string, seconds: number): Promise<void> {
      const client = await ensureClient();
      if (!client) return;
      try {
        await client.expire(key, seconds);
      } catch (err) {
        logger.warn(`${serviceName}: Redis expire failed for key "${key}"`, err);
      }
    },
  };
}

export function createLegacyGracefulRedisClient(serviceName: string): any {
  logger.warn(
    `⚠️  ${serviceName}: createLegacyGracefulRedisClient is deprecated, use BoosterState instead`
  );

  return {
    isOpen: false,
    get: async () => {
      throw new Error('Legacy Redis client not available, use BoosterState');
    },
    set: async () => {
      throw new Error('Legacy Redis client not available, use BoosterState');
    },
  } as any;
}
