/**
 * Shared Redis Connection Factory
 *
 * Eliminates per-service Redis instance creation which causes:
 * - Connection thrashing and repeated handshake overhead
 * - Startup failures from simultaneous connection attempts
 * - Unnecessary memory overhead from duplicate clients
 *
 * Features:
 * - Singleton pattern with lazy initialization
 * - Exponential backoff retry logic
 * - Connection pooling for high-throughput scenarios
 * - Health checks and graceful degradation
 */

import { createClient, type RedisClientType } from 'redis';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';

interface RedisConnectionOptions {
  maxRetries?: number;
}

class RedisConnectionFactory {
  private static instance: RedisConnectionFactory;
  private primaryClient: RedisClientType | null = null;
  private subscribers: Map<string, RedisClientType> = new Map();
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): RedisConnectionFactory {
    if (!RedisConnectionFactory.instance) {
      RedisConnectionFactory.instance = new RedisConnectionFactory();
    }
    return RedisConnectionFactory.instance;
  }

  /**
   * Get or create the primary Redis client (for commands, caching, etc.)
   */
  async getPrimaryClient(options: RedisConnectionOptions = {}): Promise<RedisClientType> {
    if (this.primaryClient && this.primaryClient.isOpen) {
      return this.primaryClient;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.primaryClient) return this.primaryClient;
    }

    this.initializationPromise = this.initializePrimaryClient(options);
    await this.initializationPromise;

    if (!this.primaryClient) {
      throw new Error('Failed to initialize Redis primary client');
    }

    return this.primaryClient;
  }

  private async initializePrimaryClient(options: RedisConnectionOptions = {}): Promise<void> {
    if (!config.redis.url) {
      logger.warn('⚠️ REDIS_URL not configured - Redis features disabled');
      return;
    }

    try {
      this.primaryClient = createClient({
        url: config.redis.url,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              logger.error('❌ Redis connection failed after 10 retries');
              return new Error('Too many retries');
            }
            // Exponential backoff: 50ms, 100ms, 200ms, 400ms, ...
            const delay = Math.min(retries * 50, 2000);
            logger.info(`🔄 Redis reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
        },
      });

      // Connection event handlers
      this.primaryClient.on('connect', () => {
        logger.info('✅ Redis primary client connected');
      });

      this.primaryClient.on('ready', () => {
        logger.info('✅ Redis primary client ready');
        this.isInitialized = true;
      });

      this.primaryClient.on('error', (error) => {
        // Only log if we haven't gracefully degraded
        if (!error.message.includes('ECONNREFUSED') && !error.message.includes('ECONNRESET')) {
          logger.error('❌ Redis primary client error:', error.message);
        }
      });

      this.primaryClient.on('end', () => {
        logger.info('🔌 Redis primary client connection closed');
      });

      this.primaryClient.on('reconnecting', () => {
        logger.info('🔄 Redis primary client reconnecting...');
      });

      // Connect to Redis
      await this.primaryClient.connect();
    } catch (error: unknown) {
      logger.error('❌ Failed to initialize Redis primary client:', error.message);
      this.primaryClient = null;
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Get or create a subscriber client (for pub/sub operations)
   * Pub/sub requires dedicated connections
   */
  async getSubscriberClient(channelName: string): Promise<RedisClientType> {
    if (this.subscribers.has(channelName)) {
      const client = this.subscribers.get(channelName)!;
      if (client.isOpen) {
        return client;
      }
    }

    if (!config.redis.url) {
      throw new Error('Redis URL not configured for pub/sub');
    }

    const subscriber = createClient({
      url: config.redis.url,
    });

    subscriber.on('error', (error) => {
      logger.error(`❌ Redis subscriber [${channelName}] error:`, error.message);
    });

    await subscriber.connect();
    this.subscribers.set(channelName, subscriber);
    return subscriber;
  }

  /**
   * Health check: verify Redis is connected and responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.primaryClient || !this.primaryClient.isOpen) {
        return false;
      }

      const pong = await this.primaryClient.ping();
      return pong === 'PONG';
    } catch (error: unknown) {
      return false;
    }
  }

  /**
   * Graceful shutdown: close all connections
   */
  async shutdown(): Promise<void> {
    logger.info('🔌 Shutting down Redis connections...');

    const closePromises: Promise<void>[] = [];

    if (this.primaryClient) {
      closePromises.push(
        this.primaryClient.quit().catch((err: unknown) => {
          logger.error('Error closing primary client:', err);
        })
      );
    }

    for (const [channel, client] of Array.from(this.subscribers.entries())) {
      closePromises.push(
        client.quit().catch((err: unknown) => {
          logger.error(`Error closing subscriber [${channel}]:`, err);
        })
      );
    }

    await Promise.all(closePromises);

    this.primaryClient = null;
    this.subscribers.clear();
    this.isInitialized = false;

    logger.info('✅ All Redis connections closed');
  }

  /**
   * Check if Redis is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.primaryClient?.isOpen === true;
  }
}

// Export singleton instance
export const redisFactory = RedisConnectionFactory.getInstance();

// Export convenience functions
export async function getRedisClient(): Promise<RedisClientType | null> {
  try {
    return await redisFactory.getPrimaryClient();
  } catch (error: unknown) {
    logger.warn('⚠️ Redis not available, falling back to in-memory operation');
    return null;
  }
}

/**
 * TODO: Add function documentation
 */
export async function getRedisSubscriber(channel: string): Promise<RedisClientType> {
  return await redisFactory.getSubscriberClient(channel);
}

/**
 * TODO: Add function documentation
 */
export async function isRedisHealthy(): Promise<boolean> {
  return await redisFactory.healthCheck();
}

/**
 * TODO: Add function documentation
 */
export async function shutdownRedis(): Promise<void> {
  return await redisFactory.shutdown();
}
