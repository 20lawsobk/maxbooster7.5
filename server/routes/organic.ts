import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { viralScoringService, type ContentData } from '../services/viralScoring.js';
import { timingOptimizerService } from '../services/timingOptimizer.js';
import { contentVariantGeneratorService } from '../services/contentVariantGenerator.js';
import { algorithmIntelligenceService, type AlgorithmHealth } from '../services/algorithmIntelligence.js';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const router = Router();

const contentSchema = z.object({
  id: z.string().optional(),
  caption: z.string().min(1, 'Caption is required'),
  hashtags: z.array(z.string()).default([]),
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin']),
  contentType: z.enum(['video', 'image', 'carousel', 'text', 'story', 'reel']).default('video'),
  mediaUrl: z.string().optional(),
  duration: z.number().optional(),
  hasAudio: z.boolean().optional(),
  musicGenre: z.string().optional(),
  targetAudience: z.object({
    ageRange: z.string(),
    interests: z.array(z.string()),
    location: z.string().optional(),
  }).optional(),
  scheduledTime: z.string().datetime().optional(),
});

router.get('/viral-score/:contentId', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { contentId } = req.params;

  res.json({
    success: false,
    dormant: true,
    message: 'No content data available. Please use POST /viral-score with real content data to calculate viral score.',
    contentId,
  });
}));

router.post('/viral-score', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content } = req.body;

  const validatedContent = contentSchema.parse(content);

  const contentData: ContentData = {
    ...validatedContent,
    id: validatedContent.id || nanoid(),
    userId,
    scheduledTime: validatedContent.scheduledTime ? new Date(validatedContent.scheduledTime) : undefined,
  };

  const score = await viralScoringService.scoreContent(contentData);

  const transformedScore = {
    overall: score.overall,
    breakdown: {
      emotionalImpact: score.factors.emotionalResonance,
      trendAlignment: score.factors.trendRelevance,
      formatOptimization: score.factors.contentStructure,
      timingScore: score.factors.timingScore,
      engagementPotential: score.factors.engagementHooks,
    },
    recommendations: score.recommendations,
    predictedReach: {
      low: Math.round(score.predictedEngagement.likes * 0.5),
      mid: Math.round(score.predictedEngagement.likes),
      high: Math.round(score.predictedEngagement.likes * 2),
    },
  };

  res.json({
    success: true,
    score: transformedScore,
  });
}));

router.get('/optimal-timing/:platform', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform } = req.params;
  const { timezone = 'America/New_York' } = req.query;

  const validPlatforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  const timing = await timingOptimizerService.getOptimalTiming(
    platform,
    timezone as string,
    userId
  );

  const transformedTiming = {
    platform,
    bestTimes: timing.bestTimes.map(slot => ({
      dayOfWeek: slot.dayOfWeek,
      hour: slot.hour,
      score: slot.score,
      expectedEngagement: Math.round(slot.audienceActive * slot.score / 100),
    })),
    avoidTimes: timing.avoidTimes || [
      { dayOfWeek: 0, hour: 3, reason: 'Very low engagement period' },
      { dayOfWeek: 0, hour: 4, reason: 'Very low engagement period' },
      { dayOfWeek: 1, hour: 2, reason: 'Early morning - low activity' },
      { dayOfWeek: 1, hour: 3, reason: 'Early morning - low activity' },
    ],
  };

  res.json({
    success: true,
    timing: transformedTiming,
  });
}));

router.get('/reach-dashboard', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { timezone = 'America/New_York' } = req.query;

  const platforms = ['tiktok', 'instagram', 'youtube', 'twitter'];

  const [healthResults, timingResults] = await Promise.all([
    Promise.all(
      platforms.map(platform =>
        algorithmIntelligenceService.checkAlgorithmHealth(platform, userId)
      )
    ),
    timingOptimizerService.getOptimalTimingForAllPlatforms(timezone as string),
  ]);

  const platformHealth: Record<string, AlgorithmHealth> = {};
  platforms.forEach((platform, index) => {
    platformHealth[platform] = healthResults[index];
  });

  const overallHealth = Math.round(
    Object.values(platformHealth).reduce((sum, h) => sum + h.overallScore, 0) / platforms.length
  );

  const reachMultiplier = 1 + (overallHealth - 50) / 100;

  const allAlerts = Object.values(platformHealth)
    .flatMap(h => h.alerts)
    .filter(a => !a.resolved)
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  const allRecommendations = [...new Set(
    Object.values(platformHealth)
      .flatMap(h => h.recommendations)
  )].slice(0, 10);

  const moneySaved = {
    monthly: null,
    yearly: null,
    paidEquivalent: null,
  };

  const viralScoreTrends = platforms.map(platform => ({
    platform,
    current: null,
    previous: null,
    trend: null,
  }));

  const growthVelocity = {
    daily: null,
    weekly: null,
    monthly: null,
  };

  const heatmapData: Array<{
    dayOfWeek: number;
    hour: number;
    value: number;
    platform: string;
  }> = [];

  for (const platform of platforms) {
    const timing = timingResults[platform];
    if (timing) {
      for (const slot of timing.bestTimes.slice(0, 10)) {
        heatmapData.push({
          dayOfWeek: slot.dayOfWeek,
          hour: slot.hour,
          value: slot.score,
          platform,
        });
      }
    }
  }

  res.json({
    success: true,
    dashboard: {
      overallHealth,
      reachMultiplier: Math.round(reachMultiplier * 100) / 100,
      platformHealth,
      optimalTiming: timingResults,
      alerts: allAlerts,
      recommendations: allRecommendations,
      moneySaved,
      viralScoreTrends,
      growthVelocity,
      heatmapData,
      growthProjection: {
        current: null,
        projected30Days: null,
        projected90Days: null,
      },
      viralHighlights: platforms.map(platform => ({
        platform,
        topScore: null,
        avgScore: null,
        viralPotential: null,
      })),
      lastUpdated: new Date().toISOString(),
    },
  });
}));

router.post('/generate-variants', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content, count = 5 } = req.body;

  const validatedContent = contentSchema.parse(content);

  const contentData = {
    ...validatedContent,
    id: validatedContent.id || nanoid(),
    userId,
  };

  const variants = await contentVariantGeneratorService.generateVariants(
    contentData as any,
    count
  );

  const variantsWithScores = await Promise.all(
    variants.map(async (variant) => {
      const score = await viralScoringService.scoreContent({
        ...contentData,
        caption: variant.caption,
        hashtags: variant.hashtags,
      } as ContentData);
      return {
        ...variant,
        viralScore: score.overall,
        predictedReach: {
          low: Math.round(score.predictedEngagement.likes * 0.5),
          mid: Math.round(score.predictedEngagement.likes),
          high: Math.round(score.predictedEngagement.likes * 2),
        },
      };
    })
  );

  variantsWithScores.sort((a, b) => b.viralScore - a.viralScore);

  logger.info(`🧪 Generated ${variants.length} variants for user ${userId}`);

  res.json({
    success: true,
    variants: variantsWithScores,
    winner: variantsWithScores[0],
    statisticalConfidence: Math.min(95, 60 + variants.length * 7),
  });
}));

router.get('/algorithm-insights', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform = 'instagram' } = req.query;

  const validPlatforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin'];
  if (!validPlatforms.includes(platform as string)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  const [health, insights, patterns] = await Promise.all([
    algorithmIntelligenceService.checkAlgorithmHealth(platform as string, userId),
    algorithmIntelligenceService.getAlgorithmInsights(platform as string, userId),
    algorithmIntelligenceService.getEngagementPatterns(platform as string, userId),
  ]);

  const platformProfile = await algorithmIntelligenceService.getPlatformProfile(platform as string);

  res.json({
    success: true,
    insights: {
      platform,
      algorithmHealth: health,
      contentPreferences: platformProfile.contentPreferences,
      engagementPatterns: patterns,
      algorithmTips: insights.tips,
      benchmarks: insights.benchmarks,
      optimizationStrategies: [
        'Post during peak engagement windows',
        'Use 3-5 trending hashtags per post',
        'Engage with comments within first hour',
        'Cross-promote on other platforms',
        'Maintain consistent posting schedule',
      ],
      saveShareRatio: {
        optimal: 0.15,
        current: null,
        recommendation: 'Add more save-worthy educational content',
      },
      commentDepthStrategy: {
        avgDepth: 2.3,
        optimal: 3.5,
        tips: ['Ask questions in captions', 'Reply to every comment', 'Pin controversial takes'],
      },
    },
  });
}));

router.get('/algorithm-insights/:platform', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform } = req.params;

  const validPlatforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  const insights = await algorithmIntelligenceService.getAlgorithmInsights(platform, userId);

  res.json({
    success: true,
    insights,
  });
}));

router.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  res.json({
    overview: {
      totalReach: 0,
      totalImpressions: 0,
      totalEngagement: 0,
      viralScore: 0,
    },
    platformHealth: {},
    recommendations: [],
    moneySaved: { monthly: 0, yearly: 0 },
    growthVelocity: { daily: 0, weekly: 0, monthly: 0 },
    viralScoreTrends: [],
    alerts: [],
  });
}));

router.get('/stats', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  res.json({
    totalPosts: 0,
    totalReach: 0,
    avgEngagement: 0,
    viralPosts: 0,
  });
}));

router.get('/metrics', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  res.json({
    reach: null,
    impressions: null,
    impressionsChange: null,
    engagement: null,
    viralScore: null,
  });
}));

router.get('/recommendations', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  
  res.json({
    recommendations: [],
  });
}));

export default router;
