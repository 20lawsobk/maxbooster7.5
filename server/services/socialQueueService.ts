import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/defaults.js';
import { Redis } from 'ioredis';
import { db } from '../db';
import { posts, scheduledPostBatches, socialAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';

const isDevelopment = config.nodeEnv === 'development';
let hasLoggedWarning = false;

export interface SocialPostJobData {
  postId: string;
  batchId?: string;
  platform: string;
  content: string;
  mediaUrls?: string[];
  socialAccountId: string;
  scheduledAt?: Date;
  campaignId: string;
  retryAttempt?: number;
}

export interface BatchJobData {
  batchId: string;
  userId: string;
  posts: Array<{
    platform: string;
    content: string;
    mediaUrls?: string[];
    scheduledAt?: string;
    socialAccountId?: string;
    campaignId?: string;
  }>;
}

const PLATFORM_RATE_LIMITS = {
  twitter: { postsPerHour: 300, postsPerDay: 2400, delayMs: 12000, baseBackoffMs: 60000 },
  facebook: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000, baseBackoffMs: 120000 },
  instagram: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000, baseBackoffMs: 120000 },
  linkedin: { postsPerHour: 100, postsPerDay: 1000, delayMs: 36000, baseBackoffMs: 60000 },
  tiktok: { postsPerHour: 50, postsPerDay: 100, delayMs: 72000, baseBackoffMs: 180000 },
  youtube: { postsPerHour: 30, postsPerDay: 100, delayMs: 120000, baseBackoffMs: 300000 },
  threads: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000, baseBackoffMs: 120000 },
  default: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000, baseBackoffMs: 60000 },
};

/**
 * Rate limit backoff state - shared via Redis for multi-process support
 */
interface RateLimitBackoffState {
  platform: string;
  accountId: string;
  backoffUntil: number;
  consecutiveHits: number;
  lastHit: number;
}

/**
 * Creates Redis connection for social queue service with proper error handling
 */
function createRedisConnection(): Redis | null {
  const redisUrl = config.redis.url;
  
  // Don't create connection if no Redis URL is configured
  if (!redisUrl) {
    if (!hasLoggedWarning) {
      logger.warn('⚠️  Social Queue Service: No REDIS_URL configured, queues will not function');
      hasLoggedWarning = true;
    }
    return null;
  }
  
  const redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      if (times > config.redis.maxRetries) {
        return null;
      }
      return Math.min(times * config.redis.retryDelay, 3000);
    },
    lazyConnect: true,
    showFriendlyErrorStack: false, // Suppress internal ioredis error logging
  });

  redisClient.on('error', (err) => {
    if (isDevelopment) {
      if (!hasLoggedWarning) {
        logger.warn(
          `⚠️  Social Queue Service: Redis unavailable (${err.message}), queues will use fallback behavior`
        );
        hasLoggedWarning = true;
      }
    } else {
      logger.error(`❌ Social Queue Service Redis Error:`, err.message);
    }
  });

  redisClient.on('connect', () => {
    if (isDevelopment) {
      logger.info(`✅ Social Queue Service Redis connected`);
    }
  });

  // Don't call connect() - let it connect lazily on first use
  // This prevents promise rejection errors from being logged

  return redisClient;
}

class SocialQueueService {
  public socialQueue: Queue<SocialPostJobData, void>;
  public batchQueue: Queue<BatchJobData, void>;
  private redisClient: Redis;

  constructor() {
    const connection = createRedisConnection();
    this.redisClient = connection;

    this.socialQueue = new Queue('social-posts', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 500,
      },
    });

    this.batchQueue = new Queue('social-batches', {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });

    logger.info('📱 Social media queues initialized');
  }

  async addBatchJob(data: BatchJobData): Promise<Job<BatchJobData, void>> {
    return await this.batchQueue.add('process-batch', data, {
      priority: 1,
    });
  }

  async addSocialPostJob(
    data: SocialPostJobData,
    delay?: number
  ): Promise<Job<SocialPostJobData, void>> {
    const platform = data.platform.toLowerCase();
    const rateLimits =
      PLATFORM_RATE_LIMITS[platform as keyof typeof PLATFORM_RATE_LIMITS] ||
      PLATFORM_RATE_LIMITS.default;

    const actualDelay = delay || rateLimits.delayMs;

    return await this.socialQueue.add('publish-post', data, {
      delay: actualDelay,
      priority: data.scheduledAt ? 2 : 1,
      jobId: data.postId,
    });
  }

  async checkRateLimit(platform: string, accountId: string): Promise<boolean> {
    if (!this.redisClient) {
      logger.warn('Redis unavailable - rate limit check skipped, allowing request');
      return true;
    }

    const rateLimits =
      PLATFORM_RATE_LIMITS[platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS] ||
      PLATFORM_RATE_LIMITS.default;

    // Also check if in backoff state
    const backoffStatus = await this.isInBackoff(platform, accountId);
    if (backoffStatus.inBackoff) {
      logger.info(`⏳ Rate limit check: ${platform}/${accountId} in backoff for ${(backoffStatus.remainingMs! / 1000).toFixed(0)}s more`);
      return false;
    }

    const hourKey = `rate:${platform}:${accountId}:hour`;
    const dayKey = `rate:${platform}:${accountId}:day`;

    const [hourCount, dayCount] = await Promise.all([
      this.redisClient.get(hourKey),
      this.redisClient.get(dayKey),
    ]);

    const currentHourCount = parseInt(hourCount || '0');
    const currentDayCount = parseInt(dayCount || '0');

    return currentHourCount < rateLimits.postsPerHour && currentDayCount < rateLimits.postsPerDay;
  }

  async incrementRateLimit(platform: string, accountId: string): Promise<void> {
    if (!this.redisClient) {
      logger.warn('Redis unavailable - rate limit increment skipped');
      return;
    }

    const hourKey = `rate:${platform}:${accountId}:hour`;
    const dayKey = `rate:${platform}:${accountId}:day`;

    await Promise.all([this.redisClient.incr(hourKey), this.redisClient.incr(dayKey)]);

    await this.redisClient.expire(hourKey, 3600);
    await this.redisClient.expire(dayKey, 86400);
  }

  /**
   * Handle 429 Too Many Requests response from platform
   * Implements exponential backoff with jitter
   * HARDENED: State is shared across processes via Redis
   */
  async handle429Response(
    platform: string,
    accountId: string,
    retryAfterSeconds?: number
  ): Promise<{ backoffMs: number; shouldRetry: boolean }> {
    if (!this.redisClient) {
      logger.warn('Redis unavailable - using default backoff');
      const platformConfig = PLATFORM_RATE_LIMITS[platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS] 
        || PLATFORM_RATE_LIMITS.default;
      return { backoffMs: platformConfig.baseBackoffMs, shouldRetry: true };
    }

    const backoffKey = `backoff:${platform}:${accountId}`;
    const platformConfig = PLATFORM_RATE_LIMITS[platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS] 
      || PLATFORM_RATE_LIMITS.default;

    try {
      // Get current backoff state
      const stateJson = await this.redisClient.get(backoffKey);
      let state: RateLimitBackoffState = stateJson 
        ? JSON.parse(stateJson)
        : { platform, accountId, backoffUntil: 0, consecutiveHits: 0, lastHit: 0 };

      // Update consecutive hits
      const now = Date.now();
      const timeSinceLastHit = now - state.lastHit;
      
      // Reset consecutive hits if it's been more than 1 hour since last hit
      if (timeSinceLastHit > 3600000) {
        state.consecutiveHits = 0;
      }
      
      state.consecutiveHits++;
      state.lastHit = now;

      // Calculate backoff with exponential increase
      let backoffMs: number;
      if (retryAfterSeconds) {
        // Use platform's Retry-After header if provided
        backoffMs = retryAfterSeconds * 1000;
      } else {
        // Exponential backoff: baseBackoff * 2^consecutiveHits with jitter
        const exponentialFactor = Math.min(Math.pow(2, state.consecutiveHits - 1), 32); // Cap at 32x
        const jitter = Math.random() * 0.2 + 0.9; // 0.9 - 1.1
        backoffMs = Math.round(platformConfig.baseBackoffMs * exponentialFactor * jitter);
      }

      // Cap maximum backoff at 1 hour
      backoffMs = Math.min(backoffMs, 3600000);

      state.backoffUntil = now + backoffMs;

      // Store state in Redis with TTL
      await this.redisClient.setex(backoffKey, 7200, JSON.stringify(state)); // 2 hour TTL

      // Determine if we should retry
      const maxConsecutiveHits = 5;
      const shouldRetry = state.consecutiveHits < maxConsecutiveHits;

      logger.warn(
        `🚦 429 Rate Limited: ${platform}/${accountId} - ` +
        `Consecutive hits: ${state.consecutiveHits}, ` +
        `Backoff: ${(backoffMs / 1000).toFixed(0)}s, ` +
        `Will retry: ${shouldRetry}`
      );

      return { backoffMs, shouldRetry };
    } catch (error) {
      logger.error('Error handling 429 response:', error);
      return { backoffMs: platformConfig.baseBackoffMs, shouldRetry: true };
    }
  }

  /**
   * Check if platform is currently in backoff state
   */
  async isInBackoff(platform: string, accountId: string): Promise<{ inBackoff: boolean; remainingMs?: number }> {
    if (!this.redisClient) {
      return { inBackoff: false };
    }

    const backoffKey = `backoff:${platform}:${accountId}`;

    try {
      const stateJson = await this.redisClient.get(backoffKey);
      if (!stateJson) {
        return { inBackoff: false };
      }

      const state: RateLimitBackoffState = JSON.parse(stateJson);
      const now = Date.now();
      
      if (state.backoffUntil > now) {
        return { 
          inBackoff: true, 
          remainingMs: state.backoffUntil - now 
        };
      }

      return { inBackoff: false };
    } catch (error) {
      logger.error('Error checking backoff state:', error);
      return { inBackoff: false };
    }
  }

  /**
   * Clear backoff state after successful request
   */
  async clearBackoff(platform: string, accountId: string): Promise<void> {
    if (!this.redisClient) return;

    const backoffKey = `backoff:${platform}:${accountId}`;
    try {
      await this.redisClient.del(backoffKey);
      logger.info(`✅ Cleared backoff for ${platform}/${accountId}`);
    } catch (error) {
      logger.error('Error clearing backoff:', error);
    }
  }

  /**
   * Get rate limit status for an account across all tracked metrics
   */
  async getRateLimitStatus(platform: string, accountId: string): Promise<{
    withinLimits: boolean;
    hourlyUsed: number;
    hourlyLimit: number;
    dailyUsed: number;
    dailyLimit: number;
    inBackoff: boolean;
    backoffRemainingMs?: number;
  }> {
    const platformConfig = PLATFORM_RATE_LIMITS[platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS] 
      || PLATFORM_RATE_LIMITS.default;

    if (!this.redisClient) {
      return {
        withinLimits: true,
        hourlyUsed: 0,
        hourlyLimit: platformConfig.postsPerHour,
        dailyUsed: 0,
        dailyLimit: platformConfig.postsPerDay,
        inBackoff: false,
      };
    }

    const hourKey = `rate:${platform}:${accountId}:hour`;
    const dayKey = `rate:${platform}:${accountId}:day`;

    const [hourCount, dayCount, backoffStatus] = await Promise.all([
      this.redisClient.get(hourKey),
      this.redisClient.get(dayKey),
      this.isInBackoff(platform, accountId),
    ]);

    const hourlyUsed = parseInt(hourCount || '0');
    const dailyUsed = parseInt(dayCount || '0');
    
    const withinLimits = 
      hourlyUsed < platformConfig.postsPerHour && 
      dailyUsed < platformConfig.postsPerDay &&
      !backoffStatus.inBackoff;

    return {
      withinLimits,
      hourlyUsed,
      hourlyLimit: platformConfig.postsPerHour,
      dailyUsed,
      dailyLimit: platformConfig.postsPerDay,
      inBackoff: backoffStatus.inBackoff,
      backoffRemainingMs: backoffStatus.remainingMs,
    };
  }

  async getBatchStatus(batchId: string): Promise<{
    total: number;
    processed: number;
    successful: number;
    failed: number;
    status: string;
  } | null> {
    const batch = await db.query.scheduledPostBatches.findFirst({
      where: eq(scheduledPostBatches.id, batchId),
    });

    if (!batch) {
      return null;
    }

    return {
      total: batch.totalPosts,
      processed: batch.processedPosts,
      successful: batch.successfulPosts,
      failed: batch.failedPosts,
      status: batch.status,
    };
  }

  async updateBatchProgress(
    batchId: string,
    increment: 'processed' | 'successful' | 'failed'
  ): Promise<void> {
    const incrementField =
      increment === 'processed'
        ? 'processedPosts'
        : increment === 'successful'
          ? 'successfulPosts'
          : 'failedPosts';

    await db
      .update(scheduledPostBatches)
      .set({
        [incrementField]: sql`${scheduledPostBatches[incrementField]} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPostBatches.id, batchId));

    const batch = await db.query.scheduledPostBatches.findFirst({
      where: eq(scheduledPostBatches.id, batchId),
    });

    if (batch && batch.processedPosts >= batch.totalPosts) {
      await db
        .update(scheduledPostBatches)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(scheduledPostBatches.id, batchId));
    }
  }

  async cancelBatch(batchId: string, userId: string): Promise<boolean> {
    const batch = await db.query.scheduledPostBatches.findFirst({
      where: and(eq(scheduledPostBatches.id, batchId), eq(scheduledPostBatches.userId, userId)),
    });

    if (!batch) {
      return false;
    }

    await db
      .update(scheduledPostBatches)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(scheduledPostBatches.id, batchId));

    await db
      .update(posts)
      .set({
        status: 'cancelled',
      })
      .where(and(eq(posts.batchId, batchId), eq(posts.status, 'scheduled')));

    const pendingJobs = await this.socialQueue.getJobs(['waiting', 'delayed']);
    for (const job of pendingJobs) {
      if (job.data.batchId === batchId) {
        await job.remove();
      }
    }

    return true;
  }

  async getQueueStats(): Promise<{
    socialPosts: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    batches: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  }> {
    const [socialWaiting, socialActive, socialCompleted, socialFailed] = await Promise.all([
      this.socialQueue.getWaitingCount(),
      this.socialQueue.getActiveCount(),
      this.socialQueue.getCompletedCount(),
      this.socialQueue.getFailedCount(),
    ]);

    const [batchWaiting, batchActive, batchCompleted, batchFailed] = await Promise.all([
      this.batchQueue.getWaitingCount(),
      this.batchQueue.getActiveCount(),
      this.batchQueue.getCompletedCount(),
      this.batchQueue.getFailedCount(),
    ]);

    return {
      socialPosts: {
        waiting: socialWaiting,
        active: socialActive,
        completed: socialCompleted,
        failed: socialFailed,
      },
      batches: {
        waiting: batchWaiting,
        active: batchActive,
        completed: batchCompleted,
        failed: batchFailed,
      },
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.socialQueue.close(), this.batchQueue.close(), this.redisClient.quit()]);
    logger.info('📱 Social media queues closed');
  }
}

export const socialQueueService = new SocialQueueService();

export { Worker, Job };
