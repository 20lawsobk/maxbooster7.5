import { getBoosterStateClient } from "../lib/boosterStateClient.js";
import { config } from "../config/defaults.js";
import { db } from "../db";
import { posts, scheduledPostBatches } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { BoosterQueue } from "./queueService.js";

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
  twitter: {
    postsPerHour: 300,
    postsPerDay: 2400,
    delayMs: 12000,
    baseBackoffMs: 60000,
  },
  facebook: {
    postsPerHour: 60,
    postsPerDay: 200,
    delayMs: 60000,
    baseBackoffMs: 120000,
  },
  instagram: {
    postsPerHour: 60,
    postsPerDay: 200,
    delayMs: 60000,
    baseBackoffMs: 120000,
  },
  linkedin: {
    postsPerHour: 100,
    postsPerDay: 1000,
    delayMs: 36000,
    baseBackoffMs: 60000,
  },
  tiktok: {
    postsPerHour: 50,
    postsPerDay: 100,
    delayMs: 72000,
    baseBackoffMs: 180000,
  },
  youtube: {
    postsPerHour: 30,
    postsPerDay: 100,
    delayMs: 120000,
    baseBackoffMs: 300000,
  },
  threads: {
    postsPerHour: 60,
    postsPerDay: 200,
    delayMs: 60000,
    baseBackoffMs: 120000,
  },
  default: {
    postsPerHour: 60,
    postsPerDay: 200,
    delayMs: 60000,
    baseBackoffMs: 60000,
  },
};

interface RateLimitBackoffState {
  platform: string;
  accountId: string;
  backoffUntil: number;
  consecutiveHits: number;
  lastHit: number;
}

class SocialQueueService {
  public socialQueue: BoosterQueue<SocialPostJobData, void>;
  public batchQueue: BoosterQueue<BatchJobData, void>;

  constructor() {
    this.socialQueue = new BoosterQueue("social-posts");
    this.batchQueue = new BoosterQueue("social-batches");

    logger.info("📱 Social media queues initialized (boosterstate-backed)");
  }

  async addBatchJob(
    data: BatchJobData,
  ): Promise<{ id: string; name: string; data: BatchJobData }> {
    return await this.batchQueue.add("process-batch", data, {
      priority: 1,
    });
  }

  async addSocialPostJob(
    data: SocialPostJobData,
    _delay?: number,
  ): Promise<{ id: string; name: string; data: SocialPostJobData }> {
    data.platform.toLowerCase();

    return await this.socialQueue.add("publish-post", data, {
      priority: data.scheduledAt ? 2 : 1,
      jobId: data.postId,
    });
  }

  async checkRateLimit(platform: string, accountId: string): Promise<boolean> {
    try {
      const client = await getBoosterStateClient();

      const backoffStatus = await this.isInBackoff(platform, accountId);
      if (backoffStatus.inBackoff) {
        logger.info(
          `⏳ Rate limit check: ${platform}/${accountId} in backoff for ${(backoffStatus.remainingMs! / 1000).toFixed(0)}s more`,
        );
        return false;
      }

      const rateLimits =
        PLATFORM_RATE_LIMITS[
          platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS
        ] || PLATFORM_RATE_LIMITS.default;

      const hourKey = `rate:${platform}:${accountId}:hour`;
      const dayKey = `rate:${platform}:${accountId}:day`;

      const [hourCount, dayCount] = await Promise.all([
        client.get(hourKey),
        client.get(dayKey),
      ]);

      const currentHourCount = parseInt(hourCount || "0");
      const currentDayCount = parseInt(dayCount || "0");

      return (
        currentHourCount < rateLimits.postsPerHour &&
        currentDayCount < rateLimits.postsPerDay
      );
    } catch (error) {
      logger.warn({ err: error }, "Error checking rate limit:");
      return true;
    }
  }

  async incrementRateLimit(platform: string, accountId: string): Promise<void> {
    try {
      const client = await getBoosterStateClient();

      const hourKey = `rate:${platform}:${accountId}:hour`;
      const dayKey = `rate:${platform}:${accountId}:day`;

      await Promise.all([client.incr(hourKey), client.incr(dayKey)]);
      await client.expire(hourKey, 3600);
      await client.expire(dayKey, 86400);
    } catch (error) {
      logger.warn({ err: error }, "Error incrementing rate limit:");
    }
  }

  async handle429Response(
    platform: string,
    accountId: string,
    retryAfterSeconds?: number,
  ): Promise<{ backoffMs: number; shouldRetry: boolean }> {
    const platformConfig =
      PLATFORM_RATE_LIMITS[
        platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS
      ] || PLATFORM_RATE_LIMITS.default;

    try {
      const client = await getBoosterStateClient();

      const backoffKey = `backoff:${platform}:${accountId}`;

      const stateJson = await client.get(backoffKey);
      let state: RateLimitBackoffState = stateJson
        ? JSON.parse(stateJson)
        : {
            platform,
            accountId,
            backoffUntil: 0,
            consecutiveHits: 0,
            lastHit: 0,
          };

      const now = Date.now();
      const timeSinceLastHit = now - state.lastHit;

      if (timeSinceLastHit > 3600000) {
        state.consecutiveHits = 0;
      }

      state.consecutiveHits++;
      state.lastHit = now;

      let backoffMs: number;
      if (retryAfterSeconds) {
        backoffMs = retryAfterSeconds * 1000;
      } else {
        const exponentialFactor = Math.min(
          Math.pow(2, state.consecutiveHits - 1),
          32,
        );
        const jitter = Math.random() * 0.2 + 0.9;
        backoffMs = Math.round(
          platformConfig.baseBackoffMs * exponentialFactor * jitter,
        );
      }

      backoffMs = Math.min(backoffMs, 3600000);
      state.backoffUntil = now + backoffMs;

      await client.setex(backoffKey, 7200, JSON.stringify(state));

      const maxConsecutiveHits = 5;
      const shouldRetry = state.consecutiveHits < maxConsecutiveHits;

      logger.warn(
        `🚦 429 Rate Limited: ${platform}/${accountId} - ` +
          `Consecutive hits: ${state.consecutiveHits}, ` +
          `Backoff: ${(backoffMs / 1000).toFixed(0)}s, ` +
          `Will retry: ${shouldRetry}`,
      );

      return { backoffMs, shouldRetry };
    } catch (error) {
      logger.warn({ err: error }, "Error handling 429 response:");
      return { backoffMs: platformConfig.baseBackoffMs, shouldRetry: true };
    }
  }

  async isInBackoff(
    platform: string,
    accountId: string,
  ): Promise<{ inBackoff: boolean; remainingMs?: number }> {
    try {
      const client = await getBoosterStateClient();

      const backoffKey = `backoff:${platform}:${accountId}`;
      const stateJson = await client.get(backoffKey);
      if (!stateJson) {
        return { inBackoff: false };
      }

      const state: RateLimitBackoffState = JSON.parse(stateJson);
      const now = Date.now();

      if (state.backoffUntil > now) {
        return {
          inBackoff: true,
          remainingMs: state.backoffUntil - now,
        };
      }

      return { inBackoff: false };
    } catch (error) {
      logger.warn({ err: error }, "Error checking backoff state:");
      return { inBackoff: false };
    }
  }

  async clearBackoff(platform: string, accountId: string): Promise<void> {
    try {
      const client = await getBoosterStateClient();

      const backoffKey = `backoff:${platform}:${accountId}`;
      await client.del(backoffKey);
      logger.info(`✅ Cleared backoff for ${platform}/${accountId}`);
    } catch (error) {
      logger.warn({ err: error }, "Error clearing backoff:");
    }
  }

  async getRateLimitStatus(
    platform: string,
    accountId: string,
  ): Promise<{
    withinLimits: boolean;
    hourlyUsed: number;
    hourlyLimit: number;
    dailyUsed: number;
    dailyLimit: number;
    inBackoff: boolean;
    backoffRemainingMs?: number;
  }> {
    const platformConfig =
      PLATFORM_RATE_LIMITS[
        platform.toLowerCase() as keyof typeof PLATFORM_RATE_LIMITS
      ] || PLATFORM_RATE_LIMITS.default;

    try {
      const client = await getBoosterStateClient();

      const hourKey = `rate:${platform}:${accountId}:hour`;
      const dayKey = `rate:${platform}:${accountId}:day`;

      const [hourCount, dayCount, backoffStatus] = await Promise.all([
        client.get(hourKey),
        client.get(dayKey),
        this.isInBackoff(platform, accountId),
      ]);

      const hourlyUsed = parseInt(hourCount || "0");
      const dailyUsed = parseInt(dayCount || "0");

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
    } catch (error) {
      logger.warn({ err: error }, "Error getting rate limit status:");
      return {
        withinLimits: true,
        hourlyUsed: 0,
        hourlyLimit: platformConfig.postsPerHour,
        dailyUsed: 0,
        dailyLimit: platformConfig.postsPerDay,
        inBackoff: false,
      };
    }
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
    increment: "processed" | "successful" | "failed",
  ): Promise<void> {
    const incrementField =
      increment === "processed"
        ? "processedPosts"
        : increment === "successful"
          ? "successfulPosts"
          : "failedPosts";

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
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(scheduledPostBatches.id, batchId));
    }
  }

  async cancelBatch(batchId: string, userId: string): Promise<boolean> {
    const batch = await db.query.scheduledPostBatches.findFirst({
      where: and(
        eq(scheduledPostBatches.id, batchId),
        eq(scheduledPostBatches.userId, userId),
      ),
    });

    if (!batch) {
      return false;
    }

    await db
      .update(scheduledPostBatches)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(scheduledPostBatches.id, batchId));

    await db
      .update(posts)
      .set({
        status: "cancelled",
      })
      .where(and(eq(posts.batchId, batchId), eq(posts.status, "scheduled")));

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
    return {
      socialPosts: { waiting: 0, active: 0, completed: 0, failed: 0 },
      batches: { waiting: 0, active: 0, completed: 0, failed: 0 },
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.socialQueue.close(), this.batchQueue.close()]);
    logger.info("📱 Social media queues closed");
  }
}

export const socialQueueService = new SocialQueueService();
