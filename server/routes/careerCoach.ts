import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { careerCoachService } from '../services/careerCoachService';
import { logger } from '../logger';
import { z } from 'zod';
import { db } from '../db';
import { analytics, releases, royaltyTransactions, posts } from '../../shared/schema';
import { eq, and, gte, lte, desc, count, sum } from 'drizzle-orm';

const router = Router();

const createGoalSchema = z.object({
  goalType: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  targetValue: z.number().positive(),
  unit: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

router.get('/recommendations', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Fetching career coach recommendations for user ${userId}`);

    let recommendations = await careerCoachService.getActiveRecommendations(userId);
    
    if (recommendations.length === 0) {
      recommendations = await careerCoachService.generateDailyRecommendations(userId);
    }

    res.json({
      success: true,
      data: {
        recommendations,
        dailyTip: recommendations[0] || null,
        totalActive: recommendations.length,
        lastAnalyzed: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching career coach recommendations:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.post('/dismiss/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const recommendationId = req.params.id;

    logger.info(`Dismissing recommendation ${recommendationId} for user ${userId}`);

    const success = await careerCoachService.dismissRecommendation(userId, recommendationId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found',
      });
    }

    res.json({
      success: true,
      message: 'Recommendation dismissed',
    });
  } catch (error: any) {
    logger.error('Error dismissing recommendation:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.post('/complete/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const recommendationId = req.params.id;

    logger.info(`Completing recommendation ${recommendationId} for user ${userId}`);

    const success = await careerCoachService.completeRecommendation(userId, recommendationId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found',
      });
    }

    res.json({
      success: true,
      message: 'Recommendation marked as completed',
    });
  } catch (error: any) {
    logger.error('Error completing recommendation:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/goals', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Fetching career goals for user ${userId}`);

    const goals = await careerCoachService.getGoals(userId);

    const activeGoals = goals.filter(g => g.status === 'active');
    const completedGoals = goals.filter(g => g.status === 'completed');

    res.json({
      success: true,
      data: {
        goals,
        summary: {
          total: goals.length,
          active: activeGoals.length,
          completed: completedGoals.length,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching career goals:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.post('/goals', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Creating career goal for user ${userId}`);

    const validation = createGoalSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid goal data',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { deadline, ...goalData } = validation.data;

    const goal = await careerCoachService.createGoal(userId, {
      ...goalData,
      deadline: deadline ? new Date(deadline) : undefined,
    });

    res.status(201).json({
      success: true,
      data: goal,
    });
  } catch (error: any) {
    logger.error('Error creating career goal:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.delete('/goals/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const goalId = req.params.id;

    const success = await careerCoachService.deleteGoal(userId, goalId);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }
    res.json({ success: true, message: 'Goal deleted' });
  } catch (error: any) {
    logger.error('Error deleting career goal:', error?.message);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
}));

router.put('/goals/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const goalId = req.params.id;

    const validation = createGoalSchema.partial().safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, errors: validation.error.flatten().fieldErrors });
    }

    const { deadline, ...rest } = validation.data;
    const goal = await careerCoachService.updateGoal(userId, goalId, {
      ...rest,
      ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
    });

    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }
    res.json({ success: true, data: goal });
  } catch (error: any) {
    logger.error('Error updating career goal:', error?.message);
    res.status(500).json({ error: 'Failed to update goal' });
  }
}));

const smartGoalTypeSchema = z.enum(['streams', 'followers', 'revenue', 'releases', 'posts', 'playlists']).default('streams');

router.post('/goals/smart', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = smartGoalTypeSchema.safeParse(req.body.type);
    const type = parsed.success ? parsed.data : 'streams';

    logger.info(`Creating SMART goal (type: ${type}) for user ${userId}`);

    const goal = await careerCoachService.createSmartGoal(userId, type);

    if (!goal) {
      return res.status(400).json({
        success: false,
        message: 'Could not generate goal suggestion',
      });
    }

    res.status(201).json({
      success: true,
      data: goal,
    });
  } catch (error: any) {
    logger.error('Error creating SMART goal:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.patch('/goals/:id/progress', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const goalId = req.params.id;
    const { currentValue } = req.body;

    if (typeof currentValue !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'currentValue must be a number',
      });
    }

    logger.info(`Updating goal ${goalId} progress to ${currentValue} for user ${userId}`);

    const goal = await careerCoachService.updateGoalProgress(userId, goalId, currentValue);

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found',
      });
    }

    res.json({
      success: true,
      data: goal,
    });
  } catch (error: any) {
    logger.error('Error updating goal progress:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/analyze', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(`Analyzing career gaps for user ${userId}`);

    const gaps = await careerCoachService.analyzeCareerGaps(userId);

    res.json({
      success: true,
      data: {
        gaps,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Error analyzing career gaps:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/patterns', requireAuth, asyncHandler(async (req, res) => {
  try {
    const patterns = careerCoachService.getPatternLibrary();
    res.json({ success: true, data: { patterns, total: patterns.length } });
  } catch (error: any) {
    logger.error('Error fetching pattern library:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

router.get('/insights', requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      currentAnalytics,
      previousAnalytics,
      recentReleases,
      olderReleases,
      recentRevenue,
      previousRevenue,
      recentPosts,
    ] = await Promise.all([
      db.select({ streams: sum(analytics.streams), followers: sum(analytics.followers) })
        .from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, thirtyDaysAgo))),
      db.select({ streams: sum(analytics.streams), followers: sum(analytics.followers) })
        .from(analytics).where(and(eq(analytics.userId, userId), gte(analytics.date, sixtyDaysAgo), lte(analytics.date, thirtyDaysAgo))),
      db.select({ id: releases.id }).from(releases)
        .where(and(eq(releases.userId, userId), gte(releases.createdAt, ninetyDaysAgo))).limit(500),
      db.select({ id: releases.id }).from(releases)
        .where(and(eq(releases.userId, userId), gte(releases.createdAt, new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)))).limit(500),
      db.select({ total: sum(royaltyTransactions.amount) }).from(royaltyTransactions)
        .where(and(eq(royaltyTransactions.userId, userId), gte(royaltyTransactions.createdAt, thirtyDaysAgo))),
      db.select({ total: sum(royaltyTransactions.amount) }).from(royaltyTransactions)
        .where(and(eq(royaltyTransactions.userId, userId), gte(royaltyTransactions.createdAt, sixtyDaysAgo), lte(royaltyTransactions.createdAt, thirtyDaysAgo))),
      db.select({ id: posts.id }).from(posts)
        .where(and(eq(posts.userId, userId), gte(posts.createdAt, thirtyDaysAgo))).limit(500),
    ]);

    const currentStreams = Number(currentAnalytics[0]?.streams) || 0;
    const previousStreams = Number(previousAnalytics[0]?.streams) || 0;
    const growthRate = previousStreams > 0
      ? Math.round(((currentStreams - previousStreams) / previousStreams) * 100)
      : currentStreams > 0 ? 100 : 0;

    const currentFollowers = Number(currentAnalytics[0]?.followers) || 0;
    const previousFollowers = Number(previousAnalytics[0]?.followers) || 0;
    const followersGrowth = previousFollowers > 0
      ? Math.round(((currentFollowers - previousFollowers) / previousFollowers) * 100)
      : currentFollowers > 0 ? 100 : 0;

    const currentRevenue = Number(recentRevenue[0]?.total) || 0;
    const prevRevenue = Number(previousRevenue[0]?.total) || 0;
    const revenueTrend = prevRevenue > 0
      ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100)
      : currentRevenue > 0 ? 100 : 0;

    const releasesLast90 = recentReleases.length;
    const releaseVelocity = Math.round((releasesLast90 / 3) * 10) / 10;

    const postingFrequency = recentPosts.length;
    const engagementScore = Math.min(100, Math.round(
      (Math.min(postingFrequency, 30) / 30) * 40 +
      (releasesLast90 > 0 ? 30 : 0) +
      (currentStreams > 1000 ? 30 : currentStreams > 100 ? 15 : 5)
    ));

    // Health score: engagement 35%, releases 25%, revenue presence 20%, growth 10%, revenue trend 10%
    const careerHealthScore = Math.min(100, Math.round(
      (engagementScore * 0.35) +
      (Math.min(releasesLast90 * 8, 25)) +
      (currentRevenue > 0 ? 20 : 0) +
      (growthRate > 0 ? Math.min(growthRate * 0.5, 10) : 0) +
      (revenueTrend > 0 ? Math.min(revenueTrend * 0.5, 10) : 0)
    ));

    const healthLabel = careerHealthScore >= 80 ? 'Excellent' : careerHealthScore >= 60 ? 'Good' : careerHealthScore >= 40 ? 'Fair' : 'Needs Work';

    res.json({
      insights: {
        growthRate,
        growthRateDisplay: growthRate >= 0 ? `+${growthRate}%` : `${growthRate}%`,
        followersGrowth,
        followersGrowthDisplay: followersGrowth >= 0 ? `+${followersGrowth}%` : `${followersGrowth}%`,
        currentFollowers,
        engagementScore,
        releaseVelocity,
        revenueTrend,
        revenueTrendDisplay: revenueTrend >= 0 ? `+${revenueTrend}%` : `${revenueTrend}%`,
        careerHealthScore,
        healthLabel,
        postsThisMonth: postingFrequency,
        releasesLast90Days: releasesLast90,
        currentMonthRevenue: currentRevenue,
        currentMonthStreams: currentStreams,
      }
    });
  } catch (error: any) {
    logger.error('Error fetching career insights:', error?.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
}));

export default router;
