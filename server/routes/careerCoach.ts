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

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

const CAREER_KNOWLEDGE: Record<string, { keywords: string[]; response: string }> = {
  social: {
    keywords: ['social media', 'instagram', 'tiktok', 'twitter', 'x ', 'facebook', 'youtube', 'content', 'post', 'followers', 'engagement'],
    response: 'For social media growth, consistency is key. Post at least 3-5 times per week across your main platforms. TikTok and Instagram Reels drive the most organic discovery right now — short-form video of behind-the-scenes studio moments, snippets of new music, and authentic storytelling outperform polished ads. Use Max Booster\'s Social Media hub to schedule posts and track engagement trends. Aim to respond to every comment in the first hour after posting to boost your content in the algorithm.',
  },
  release: {
    keywords: ['release', 'single', 'album', 'ep', 'distribute', 'spotify', 'apple music', 'streaming', 'upload', 'drop'],
    response: 'The ideal release strategy starts 4-6 weeks before your drop date. Begin teasing 30-second clips 3 weeks out, lock in playlist pitching 2 weeks out (Spotify editorial requires at least 7 days in advance), and ramp up social frequency in the final week. Use Max Booster\'s Distribution module to submit to all major DSPs in one go. Post-release, focus on playlist campaigns and fan engagement for the first 2 weeks — early stream velocity signals matter a lot to algorithms.',
  },
  marketing: {
    keywords: ['marketing', 'promote', 'promotion', 'advertise', 'advertising', 'campaign', 'budget', 'ads', 'paid'],
    response: 'For music marketing on a budget, prioritize platforms where your audience already lives. Facebook/Instagram ads with a $5-15/day budget work well for awareness. Always retarget people who\'ve engaged with your profile before — they convert at 3-5x the rate of cold audiences. Use Max Booster\'s Advertising dashboard to create campaigns and track ROAS. Pair paid ads with organic push on the same day for maximum impact. Video ads under 15 seconds outperform longer formats by 40%.',
  },
  revenue: {
    keywords: ['money', 'income', 'revenue', 'royalty', 'royalties', 'earn', 'sync', 'licensing', 'merch', 'merchandise'],
    response: 'Diversifying revenue is critical for music career sustainability. Streaming royalties average $0.003-0.005 per stream, so supplement with sync licensing (film, TV, ads), live performance, and merchandise. Sync placements can pay $500-50,000+ per placement. Register with ASCAP, BMI, or SESAC for performance royalties. Max Booster\'s Royalties section tracks your streaming income across all DSPs. Consider offering exclusive content or early access through Patreon or a fan club to build recurring revenue.',
  },
  growth: {
    keywords: ['grow', 'growth', 'fans', 'audience', 'reach', 'discovery', 'playlist', 'curators', 'blog'],
    response: 'Sustainable audience growth comes from a mix of organic discovery and targeted outreach. Submit to independent playlist curators on SubmitHub and Groover — even placements on smaller playlists (1,000-10,000 followers) add up. Collaborate with artists in adjacent genres to cross-pollinate audiences. Feature in music blogs and podcasts for credibility. On streaming platforms, release consistently — artists who drop every 4-6 weeks see 40% more algorithmic playlist consideration than those who release infrequently.',
  },
  brand: {
    keywords: ['brand', 'image', 'identity', 'logo', 'visual', 'bio', 'press', 'epp', 'press kit'],
    response: 'Your artist brand is your first impression with industry gatekeepers and potential fans. Ensure your artist name, photo, bio, and visual style are consistent across all platforms. A professional press kit (EPK) with high-res photos, a concise bio, notable achievements, and streaming links is essential for booking shows and pitching to labels. Max Booster\'s Press Kit builder helps you create a shareable EPK in minutes. Update it with every major release or achievement.',
  },
  performance: {
    keywords: ['show', 'live', 'performance', 'concert', 'gig', 'tour', 'booking', 'venue', 'setlist'],
    response: 'Live performance is one of the most powerful audience-building tools available. Start with local venues, open mics, and supporting slots for established artists. Build a tight 20-30 minute set before pitching to bookers. Use the Show Mode feature in Max Booster to manage setlists, BPMs, and transitions during live performances. Document every show with quality photos and video — this content performs well on social and builds your performance portfolio for better bookings.',
  },
  ai: {
    keywords: ['ai', 'artificial intelligence', 'max booster', 'autopilot', 'automation', 'machine learning'],
    response: 'Max Booster\'s AI system analyzes your music career data across social, streaming, advertising, and engagement metrics to surface actionable recommendations. The Autopilot feature can automatically post content, optimize ad bids, and flag growth opportunities. The AI Career Coach (that\'s me!) is trained on music industry patterns and can answer questions about strategy, releases, marketing, and more. Check your Dashboard for personalized daily recommendations based on your career trajectory.',
  },
};

const DEFAULT_RESPONSE = 'Great question! As your AI Career Coach, I\'m here to help you navigate the music industry. I can advise on topics like social media strategy, release planning, marketing campaigns, revenue diversification, audience growth, artist branding, live performance, and how to use Max Booster\'s tools to their full potential. What specific area of your music career would you like to focus on?';

router.post('/chat', requireAuth, asyncHandler(async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const { message } = parsed.data;
  const lowerMsg = message.toLowerCase();

  let response = DEFAULT_RESPONSE;
  for (const [, entry] of Object.entries(CAREER_KNOWLEDGE)) {
    if (entry.keywords.some((kw) => lowerMsg.includes(kw))) {
      response = entry.response;
      break;
    }
  }

  logger.info(`Career coach chat for user ${req.user!.id}: "${message.slice(0, 60)}..."`);
  res.json({ response });
}));

export default router;
