import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { posts, scheduledPostBatches, socialAccounts, socialCampaigns } from '@shared/schema';
import { bulkSchedulePostSchema, bulkValidatePostSchema } from '@shared/schema';
import { socialQueueService } from '../services/socialQueueService';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { logger } from '../logger.js';

const router = Router();

interface AuthenticatedRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
  };
}

router.post('/validate', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = bulkValidatePostSchema.parse(req.body);
    const errors: Array<{ index: number; field: string; message: string }> = [];
    const warnings: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < validatedData.posts.length; i++) {
      const post = validatedData.posts[i];

      if (!post.platform || post.platform.trim() === '') {
        errors.push({
          index: i,
          field: 'platform',
          message: 'Platform is required',
        });
      }

      const validPlatforms = [
        'twitter',
        'facebook',
        'instagram',
        'linkedin',
        'tiktok',
        'youtube',
        'threads',
      ];
      if (!validPlatforms.includes(post.platform.toLowerCase())) {
        errors.push({
          index: i,
          field: 'platform',
          message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
        });
      }

      if (!post.content || post.content.trim() === '') {
        errors.push({
          index: i,
          field: 'content',
          message: 'Content is required',
        });
      }

      const platformLimits: Record<string, number> = {
        twitter: 280,
        linkedin: 3000,
        facebook: 63206,
        instagram: 2200,
        tiktok: 2200,
        youtube: 5000,
        threads: 500,
      };

      const limit = platformLimits[post.platform.toLowerCase()];
      if (limit && post.content.length > limit) {
        errors.push({
          index: i,
          field: 'content',
          message: `Content exceeds ${limit} character limit for ${post.platform}`,
        });
      }

      if (post.scheduledAt) {
        const scheduledDate = new Date(post.scheduledAt);
        const now = new Date();

        if (isNaN(scheduledDate.getTime())) {
          errors.push({
            index: i,
            field: 'scheduledAt',
            message: 'Invalid date format',
          });
        } else if (scheduledDate < now) {
          errors.push({
            index: i,
            field: 'scheduledAt',
            message: 'Scheduled time must be in the future',
          });
        } else if (scheduledDate.getTime() - now.getTime() < 5 * 60 * 1000) {
          warnings.push({
            index: i,
            message: 'Post scheduled less than 5 minutes from now',
          });
        }
      }

      if (post.socialAccountId) {
        const account = await db.query.socialAccounts.findFirst({
          where: and(
            eq(socialAccounts.id, post.socialAccountId),
            eq(socialAccounts.userId, req.user.id)
          ),
        });

        if (!account) {
          errors.push({
            index: i,
            field: 'socialAccountId',
            message: 'Social account not found or does not belong to user',
          });
        }
      }
    }

    return res.json({
      valid: errors.length === 0,
      totalPosts: validatedData.posts.length,
      errors,
      warnings,
    });
  } catch (error: unknown) {
    logger.error('Bulk validation error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/schedule', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = bulkSchedulePostSchema.parse(req.body);

    if (validatedData.posts.length > 500) {
      return res.status(400).json({
        error: 'Batch size exceeds maximum of 500 posts',
      });
    }

    const validationErrors: Array<{ index: number; field: string; message: string }> = [];

    for (let i = 0; i < validatedData.posts.length; i++) {
      const post = validatedData.posts[i];

      if (!post.content || post.content.trim() === '') {
        validationErrors.push({
          index: i,
          field: 'content',
          message: 'Content is required',
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: validationErrors,
      });
    }

    const [batch] = await db
      .insert(scheduledPostBatches)
      .values({
        userId: req.user.id,
        totalPosts: validatedData.posts.length,
        processedPosts: 0,
        successfulPosts: 0,
        failedPosts: 0,
        status: 'processing',
        metadata: validatedData.metadata || {},
      })
      .returning();

    const defaultCampaignId = validatedData.posts[0]?.campaignId || nanoid();

    if (!validatedData.posts[0]?.campaignId) {
      await db
        .insert(socialCampaigns)
        .values({
          userId: req.user.id,
          name: `Bulk Schedule - ${new Date().toISOString()}`,
          platforms: [...new Set(validatedData.posts.map((p) => p.platform))],
          status: 'active',
        })
        .catch((err) => {
          logger.error('Error creating default campaign:', err);
        });
    }

    const postsToInsert = validatedData.posts.map((post) => ({
      campaignId: post.campaignId || defaultCampaignId,
      batchId: batch.id,
      platform: post.platform,
      socialAccountId: post.socialAccountId || nanoid(),
      content: post.content,
      mediaUrls: post.mediaUrls || [],
      status: 'scheduled',
      scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : new Date(),
    }));

    const insertedPosts = await db.insert(posts).values(postsToInsert).returning();

    for (const post of insertedPosts) {
      const scheduledDate = post.scheduledAt || new Date();
      const delay = scheduledDate.getTime() - Date.now();

      await socialQueueService.addSocialPostJob(
        {
          postId: post.id,
          batchId: batch.id,
          platform: post.platform,
          content: post.content || '',
          mediaUrls: (post.mediaUrls as string[]) || [],
          socialAccountId: post.socialAccountId,
          campaignId: post.campaignId,
          scheduledAt: post.scheduledAt || undefined,
        },
        Math.max(0, delay)
      );
    }

    return res.status(201).json({
      success: true,
      batchId: batch.id,
      totalPosts: validatedData.posts.length,
      message: 'Batch scheduled successfully',
    });
  } catch (error: unknown) {
    logger.error('Bulk schedule error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status/:batchId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { batchId } = req.params;

    const batch = await db.query.scheduledPostBatches.findFirst({
      where: and(
        eq(scheduledPostBatches.id, batchId),
        eq(scheduledPostBatches.userId, req.user.id)
      ),
    });

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const batchPosts = await db.query.posts.findMany({
      where: eq(posts.batchId, batchId),
      orderBy: [desc(posts.createdAt)],
    });

    const statusBreakdown = batchPosts.reduce(
      (acc, post) => {
        acc[post.status] = (acc[post.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const queueStats = await socialQueueService.getQueueStats();

    return res.json({
      batchId: batch.id,
      status: batch.status,
      totalPosts: batch.totalPosts,
      processedPosts: batch.processedPosts,
      successfulPosts: batch.successfulPosts,
      failedPosts: batch.failedPosts,
      statusBreakdown,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      completedAt: batch.completedAt,
      queueStats,
      posts: batchPosts.map((post) => ({
        id: post.id,
        platform: post.platform,
        status: post.status,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        error: post.error,
      })),
    });
  } catch (error: unknown) {
    logger.error('Batch status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:batchId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { batchId } = req.params;

    const cancelled = await socialQueueService.cancelBatch(batchId, req.user.id);

    if (!cancelled) {
      return res.status(404).json({ error: 'Batch not found or already completed' });
    }

    return res.json({
      success: true,
      message: 'Batch cancelled successfully',
    });
  } catch (error: unknown) {
    logger.error('Cancel batch error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/batches', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const batches = await db.query.scheduledPostBatches.findMany({
      where: eq(scheduledPostBatches.userId, req.user.id),
      orderBy: [desc(scheduledPostBatches.createdAt)],
      limit: 50,
    });

    return res.json({
      batches: batches.map((batch) => ({
        id: batch.id,
        totalPosts: batch.totalPosts,
        processedPosts: batch.processedPosts,
        successfulPosts: batch.successfulPosts,
        failedPosts: batch.failedPosts,
        status: batch.status,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        completedAt: batch.completedAt,
      })),
    });
  } catch (error: unknown) {
    logger.error('Get batches error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
