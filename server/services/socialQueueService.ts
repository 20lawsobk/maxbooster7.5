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
  twitter: { postsPerHour: 300, postsPerDay: 2400, delayMs: 12000 },
  facebook: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000 },
  instagram: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000 },
  linkedin: { postsPerHour: 100, postsPerDay: 1000, delayMs: 36000 },
  tiktok: { postsPerHour: 50, postsPerDay: 100, delayMs: 72000 },
  youtube: { postsPerHour: 30, postsPerDay: 100, delayMs: 120000 },
  threads: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000 },
  default: { postsPerHour: 60, postsPerDay: 200, delayMs: 60000 },
};

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
    const rateLimits =
      PLATFORM_RATE_LIMITS[platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS] ||
      PLATFORM_RATE_LIMITS.default;

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
    const hourKey = `rate:${platform}:${accountId}:hour`;
    const dayKey = `rate:${platform}:${accountId}:day`;

    await Promise.all([this.redisClient.incr(hourKey), this.redisClient.incr(dayKey)]);

    await this.redisClient.expire(hourKey, 3600);
    await this.redisClient.expire(dayKey, 86400);
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
