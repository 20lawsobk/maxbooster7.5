import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { posts, scheduledPostBatches, socialAccounts, socialCampaigns } from '@shared/schema';
import { bulkSchedulePostSchema, bulkValidatePostSchema } from '@shared/schema';
import { socialQueueService } from '../services/socialQueueService';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { logger } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/validate', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const validatedData = bulkValidatePostSchema.parse(req.body);
    const errors: Array<{ index: number; field: string; message: string }> = [];
    const warnings: Array<{ index: number; message: string }> = [];

    const validPlatforms = ['twitter', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'threads'];

    const platformLimits: Record<string, number> = {
      twitter: 280,
      linkedin: 3000,
      facebook: 63206,
      instagram: 2200,
      tiktok: 2200,
      youtube: 5000,
      threads: 500,
    };

    const now = new Date();

    // Batch-load all referenced socialAccountIds in a single query (avoid N+1)
    const referencedAccountIds = [
      ...new Set(
        validatedData.posts
          .map((p) => p.socialAccountId)
          .filter(Boolean) as string[]
      ),
    ];
    const ownedAccountIdSet = new Set<string>();
    if (referencedAccountIds.length > 0) {
      const ownedAccounts = await db
        .select({ id: socialAccounts.id })
        .from(socialAccounts)
        .where(
          and(
            inArray(socialAccounts.id, referencedAccountIds),
            eq(socialAccounts.userId, userId)
          )
        )
        .limit(100);
      for (const a of ownedAccounts) ownedAccountIdSet.add(a.id);
    }

    for (let i = 0; i < validatedData.posts.length; i++) {
      const post = validatedData.posts[i];
      const platform = (post.platform || '').toLowerCase();

      if (!post.platform || post.platform.trim() === '') {
        errors.push({ index: i, field: 'platform', message: 'Platform is required' });
      } else if (!validPlatforms.includes(platform)) {
        errors.push({
          index: i,
          field: 'platform',
          message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
        });
      }

      if (!post.content || post.content.trim() === '') {
        errors.push({ index: i, field: 'content', message: 'Content is required' });
      } else {
        const limit = platformLimits[platform];
        if (limit && post.content.length > limit) {
          errors.push({
            index: i,
            field: 'content',
            message: `Content exceeds ${limit} character limit for ${post.platform}`,
          });
        }
      }

      if (post.scheduledAt) {
        const scheduledDate = new Date(post.scheduledAt);
        if (isNaN(scheduledDate.getTime())) {
          errors.push({ index: i, field: 'scheduledAt', message: 'Invalid date format' });
        } else if (scheduledDate < now) {
          errors.push({ index: i, field: 'scheduledAt', message: 'Scheduled time must be in the future' });
        } else if (scheduledDate.getTime() - now.getTime() < 5 * 60 * 1000) {
          warnings.push({ index: i, message: 'Post scheduled less than 5 minutes from now' });
        }
      }

      if (post.socialAccountId && !ownedAccountIdSet.has(post.socialAccountId)) {
        errors.push({
          index: i,
          field: 'socialAccountId',
          message: 'Social account not found or does not belong to you',
        });
      }
    }

    return res.json({
      valid: errors.length === 0,
      totalPosts: validatedData.posts.length,
      errors,
      warnings,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Bulk validation error:');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/schedule', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const validatedData = bulkSchedulePostSchema.parse(req.body);

    if (validatedData.posts.length === 0) {
      return res.status(400).json({ error: 'At least one post is required' });
    }

    if (validatedData.posts.length > 500) {
      return res.status(400).json({ error: 'Batch size exceeds maximum of 500 posts' });
    }

    const validationErrors: Array<{ index: number; field: string; message: string }> = [];
    for (let i = 0; i < validatedData.posts.length; i++) {
      const post = validatedData.posts[i];
      if (!post.content || post.content.trim() === '') {
        validationErrors.push({ index: i, field: 'content', message: 'Content is required' });
      }
    }
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', errors: validationErrors });
    }

    // Verify social account ownership in a single batch query
    const accountIds = [
      ...new Set(
        validatedData.posts.map((p) => p.socialAccountId).filter(Boolean) as string[]
      ),
    ];
    if (accountIds.length > 0) {
      const ownedAccounts = await db
        .select({ id: socialAccounts.id })
        .from(socialAccounts)
        .where(and(inArray(socialAccounts.id, accountIds), eq(socialAccounts.userId, userId)))
        .limit(100);
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      const badIndex = validatedData.posts.findIndex(
        (p) => p.socialAccountId && !ownedIds.has(p.socialAccountId)
      );
      if (badIndex !== -1) {
        return res.status(403).json({
          error: 'One or more social accounts do not belong to you',
          index: badIndex,
        });
      }
    }

    // Verify campaign ownership in a single batch query
    const campaignIds = [
      ...new Set(
        validatedData.posts.map((p) => p.campaignId).filter(Boolean) as string[]
      ),
    ];
    if (campaignIds.length > 0) {
      const ownedCampaigns = await db
        .select({ id: socialCampaigns.id })
        .from(socialCampaigns)
        .where(and(inArray(socialCampaigns.id, campaignIds), eq(socialCampaigns.userId, userId)))
        .limit(100);
      const ownedCampaignIds = new Set(ownedCampaigns.map((c) => c.id));
      const badCampaignIndex = validatedData.posts.findIndex(
        (p) => p.campaignId && !ownedCampaignIds.has(p.campaignId)
      );
      if (badCampaignIndex !== -1) {
        return res.status(403).json({
          error: 'One or more campaigns do not belong to you',
          index: badCampaignIndex,
        });
      }
    }

    // Determine campaignId: use existing one from posts, or create a new campaign
    let defaultCampaignId = validatedData.posts[0]?.campaignId;
    if (!defaultCampaignId) {
      // Insert campaign first and retrieve its generated ID
      const [newCampaign] = await db
        .insert(socialCampaigns)
        .values({
          userId,
          name: `Bulk Schedule - ${new Date().toISOString()}`,
          platforms: [...new Set(validatedData.posts.map((p) => p.platform))],
          status: 'active',
        })
        .returning({ id: socialCampaigns.id });
      defaultCampaignId = newCampaign.id;
    }

    const [batch] = await db
      .insert(scheduledPostBatches)
      .values({
        userId,
        totalPosts: validatedData.posts.length,
        processedPosts: 0,
        successfulPosts: 0,
        failedPosts: 0,
        status: 'processing',
        metadata: validatedData.metadata || {},
      })
      .returning();

    const postsToInsert = validatedData.posts.map((post) => ({
      userId,
      campaignId: post.campaignId || defaultCampaignId,
      batchId: batch.id,
      platform: post.platform,
      socialAccountId: post.socialAccountId || null,
      content: post.content,
      mediaUrls: post.mediaUrls || [],
      status: 'scheduled',
      scheduledAt: post.scheduledAt ? new Date(post.scheduledAt) : new Date(),
    }));

    const insertedPosts = await db.insert(posts).values(postsToInsert).returning();

    // Queue all posts — parallelise with Promise.all for speed
    await Promise.all(
      insertedPosts.map((post) => {
        const scheduledDate = post.scheduledAt || new Date();
        const delay = Math.max(0, scheduledDate.getTime() - Date.now());
        return socialQueueService.addSocialPostJob(
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
          delay
        );
      })
    );

    return res.status(201).json({
      success: true,
      batchId: batch.id,
      campaignId: defaultCampaignId,
      totalPosts: validatedData.posts.length,
      message: 'Batch scheduled successfully',
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Bulk schedule error:');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status/:batchId', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { batchId } = req.params;

    if (!batchId || typeof batchId !== 'string') {
      return res.status(400).json({ error: 'Invalid batch ID' });
    }

    const batch = await db.query.scheduledPostBatches.findFirst({
      where: and(
        eq(scheduledPostBatches.id, batchId),
        eq(scheduledPostBatches.userId, userId)
      ),
    });

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Limit to 500 (the max batch size), ordered by schedule time
    const batchPosts = await db.query.posts.findMany({
      where: and(eq(posts.batchId, batchId), eq(posts.userId, userId)),
      orderBy: [desc(posts.createdAt)],
      limit: 500,
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
    logger.warn({ err: error }, 'Batch status error:');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:batchId', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { batchId } = req.params;

    if (!batchId || typeof batchId !== 'string') {
      return res.status(400).json({ error: 'Invalid batch ID' });
    }

    const cancelled = await socialQueueService.cancelBatch(batchId, userId);

    if (!cancelled) {
      return res.status(404).json({ error: 'Batch not found or already completed' });
    }

    return res.json({ success: true, message: 'Batch cancelled successfully' });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Cancel batch error:');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/batches', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10)));

    const batches = await db.query.scheduledPostBatches.findMany({
      where: eq(scheduledPostBatches.userId, userId),
      orderBy: [desc(scheduledPostBatches.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return res.json({
      page,
      pageSize,
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
    logger.warn({ err: error }, 'Get batches error:');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const queueStats = await socialQueueService.getQueueStats();
    return res.json({
      status: 'ready',
      queuedPosts: queueStats?.waiting ?? 0,
      processingPosts: queueStats?.active ?? 0,
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Get bulk status error:');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
