import { getRedisClient } from '../lib/redisConnectionFactory.js';
import { logger } from '../logger.js';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const DEFAULT_TTL_SECONDS = 86400;

export interface IdempotencyResult<T = any> {
  exists: boolean;
  result?: T;
  cachedAt?: Date;
}

export interface IdempotencyOptions {
  ttlSeconds?: number;
  prefix?: string;
}

class IdempotencyService {
  private memoryFallback: Map<string, { data: any; expiresAt: number }> = new Map();
  private readonly maxMemoryEntries = 1000;

  private getFullKey(key: string, prefix?: string): string {
    return `${prefix || IDEMPOTENCY_PREFIX}${key}`;
  }

  private cleanupMemoryFallback(): void {
    const now = Date.now();
    for (const [key, value] of this.memoryFallback.entries()) {
      if (value.expiresAt < now) {
        this.memoryFallback.delete(key);
      }
    }
    if (this.memoryFallback.size >= this.maxMemoryEntries) {
      const oldestKey = this.memoryFallback.keys().next().value;
      if (oldestKey) {
        this.memoryFallback.delete(oldestKey);
      }
    }
  }

  async checkAndSet<T>(
    key: string,
    result: T,
    options: IdempotencyOptions = {}
  ): Promise<IdempotencyResult<T>> {
    const { ttlSeconds = DEFAULT_TTL_SECONDS, prefix } = options;
    const fullKey = this.getFullKey(key, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        const existing = await redis.get(fullKey);
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            logger.info(`Idempotency hit for key: ${key}`);
            return {
              exists: true,
              result: parsed.result as T,
              cachedAt: new Date(parsed.cachedAt),
            };
          } catch {
            return { exists: true };
          }
        }

        const data = JSON.stringify({
          result,
          cachedAt: new Date().toISOString(),
        });
        await redis.setEx(fullKey, ttlSeconds, data);
        logger.info(`Idempotency key set: ${key} (TTL: ${ttlSeconds}s)`);
        return { exists: false };
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for idempotency, using memory fallback: ${(error as Error).message}`);
    }

    this.cleanupMemoryFallback();
    const existing = this.memoryFallback.get(fullKey);
    if (existing && existing.expiresAt > Date.now()) {
      logger.info(`Idempotency hit (memory) for key: ${key}`);
      return {
        exists: true,
        result: existing.data.result as T,
        cachedAt: new Date(existing.data.cachedAt),
      };
    }

    this.memoryFallback.set(fullKey, {
      data: { result, cachedAt: new Date().toISOString() },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return { exists: false };
  }

  async check(key: string, options: IdempotencyOptions = {}): Promise<IdempotencyResult> {
    const { prefix } = options;
    const fullKey = this.getFullKey(key, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        const existing = await redis.get(fullKey);
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            return {
              exists: true,
              result: parsed.result,
              cachedAt: new Date(parsed.cachedAt),
            };
          } catch {
            return { exists: true };
          }
        }
        return { exists: false };
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for idempotency check: ${(error as Error).message}`);
    }

    const existing = this.memoryFallback.get(fullKey);
    if (existing && existing.expiresAt > Date.now()) {
      return {
        exists: true,
        result: existing.data.result,
        cachedAt: new Date(existing.data.cachedAt),
      };
    }
    return { exists: false };
  }

  async set<T>(
    key: string,
    result: T,
    options: IdempotencyOptions = {}
  ): Promise<void> {
    const { ttlSeconds = DEFAULT_TTL_SECONDS, prefix } = options;
    const fullKey = this.getFullKey(key, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        const data = JSON.stringify({
          result,
          cachedAt: new Date().toISOString(),
        });
        await redis.setEx(fullKey, ttlSeconds, data);
        logger.info(`Idempotency key set: ${key} (TTL: ${ttlSeconds}s)`);
        return;
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for idempotency set: ${(error as Error).message}`);
    }

    this.cleanupMemoryFallback();
    this.memoryFallback.set(fullKey, {
      data: { result, cachedAt: new Date().toISOString() },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async get<T>(key: string, options: IdempotencyOptions = {}): Promise<T | null> {
    const { prefix } = options;
    const fullKey = this.getFullKey(key, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        const data = await redis.get(fullKey);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            return parsed.result as T;
          } catch {
            return null;
          }
        }
        return null;
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for idempotency get: ${(error as Error).message}`);
    }

    const existing = this.memoryFallback.get(fullKey);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.data.result as T;
    }
    return null;
  }

  async remove(key: string, options: IdempotencyOptions = {}): Promise<void> {
    const { prefix } = options;
    const fullKey = this.getFullKey(key, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        await redis.del(fullKey);
        logger.info(`Idempotency key removed: ${key}`);
        return;
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for idempotency remove: ${(error as Error).message}`);
    }

    this.memoryFallback.delete(fullKey);
  }

  async markProcessing(key: string, options: IdempotencyOptions = {}): Promise<boolean> {
    const { ttlSeconds = 300, prefix } = options;
    const fullKey = this.getFullKey(`processing:${key}`, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        const result = await redis.set(fullKey, 'processing', {
          NX: true,
          EX: ttlSeconds,
        });
        return result === 'OK';
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for markProcessing: ${(error as Error).message}`);
    }

    if (this.memoryFallback.has(fullKey)) {
      const existing = this.memoryFallback.get(fullKey)!;
      if (existing.expiresAt > Date.now()) {
        return false;
      }
    }
    this.memoryFallback.set(fullKey, {
      data: 'processing',
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  async clearProcessing(key: string, options: IdempotencyOptions = {}): Promise<void> {
    const { prefix } = options;
    const fullKey = this.getFullKey(`processing:${key}`, prefix);

    try {
      const redis = await getRedisClient();

      if (redis) {
        await redis.del(fullKey);
        return;
      }
    } catch (error: unknown) {
      logger.warn(`Redis unavailable for clearProcessing: ${(error as Error).message}`);
    }

    this.memoryFallback.delete(fullKey);
  }

  generateKey(...parts: (string | number)[]): string {
    return parts.filter(Boolean).join(':');
  }

  generateWebhookKey(eventId: string, eventType?: string): string {
    return this.generateKey('webhook', eventType || 'event', eventId);
  }

  generatePayoutKey(userId: string, amount: number, currency: string): string {
    const timestamp = Math.floor(Date.now() / 60000);
    return this.generateKey('payout', userId, amount.toString(), currency, timestamp.toString());
  }

  generatePaymentKey(userId: string, paymentIntent: string): string {
    return this.generateKey('payment', userId, paymentIntent);
  }

  generateDistributionKey(releaseId: string, action: string): string {
    return this.generateKey('distribution', releaseId, action);
  }
}

export const idempotencyService = new IdempotencyService();
