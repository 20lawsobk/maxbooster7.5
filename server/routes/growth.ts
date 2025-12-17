import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { viralScoringService, type ContentData, type ViralScore } from '../services/viralScoring.js';
import { timingOptimizerService, type OptimalTiming } from '../services/timingOptimizer.js';
import { contentVariantGeneratorService, type Variant } from '../services/contentVariantGenerator.js';
import { algorithmIntelligenceService, type AlgorithmHealth } from '../services/algorithmIntelligence.js';
import { nanoid } from 'nanoid';

const router = Router();

const contentDataSchema = z.object({
  id: z.string().optional(),
  caption: z.string().min(1, 'Caption is required'),
  hashtags: z.array(z.string()).default([]),
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin']),
  contentType: z.enum(['video', 'image', 'carousel', 'text', 'story', 'reel']),
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

const scoreViralSchema = z.object({
  content: contentDataSchema,
});

const generateVariantsSchema = z.object({
  content: contentDataSchema,
  count: z.number().min(1).max(10).default(5),
});

const compareVariantsSchema = z.object({
  variants: z.array(contentDataSchema).min(2).max(10),
});

const timingSchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin']),
  timezone: z.string().default('America/New_York'),
  targetDate: z.string().datetime().optional(),
});

const algorithmHealthSchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin']),
  recentMetrics: z.object({
    impressions: z.array(z.number()).optional(),
    engagement: z.array(z.number()).optional(),
    followers: z.array(z.number()).optional(),
    hashtagReach: z.array(z.number()).optional(),
  }).optional(),
});

const shadowbanCheckSchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin']),
  recentMetrics: z.object({
    hashtagReach: z.number(),
    exploreReach: z.number(),
    nonFollowerReach: z.number(),
    newEngagement: z.number(),
    searchVisibility: z.number(),
  }).optional(),
});

router.post('/score-viral', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content } = scoreViralSchema.parse(req.body);

  const contentData: ContentData = {
    ...content,
    id: content.id || nanoid(),
    userId,
    scheduledTime: content.scheduledTime ? new Date(content.scheduledTime) : undefined,
  };

  const score = await viralScoringService.scoreContent(contentData);

  logger.info(`📊 Viral score calculated for user ${userId}: ${score.overall}/100`);

  res.json({
    success: true,
    score,
  });
}));

router.post('/predict-potential', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content } = scoreViralSchema.parse(req.body);

  const contentData: ContentData = {
    ...content,
    id: content.id || nanoid(),
    userId,
  };

  const potential = await viralScoringService.predictViralPotential(contentData);

  res.json({
    success: true,
    potential,
    category: potential >= 80 ? 'high' : potential >= 50 ? 'medium' : 'low',
  });
}));

router.post('/suggest-improvements', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content } = scoreViralSchema.parse(req.body);

  const contentData: ContentData = {
    ...content,
    id: content.id || nanoid(),
    userId,
  };

  const improvements = await viralScoringService.suggestImprovements(contentData);

  res.json({
    success: true,
    improvements,
  });
}));

router.post('/compare-variants', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { variants } = compareVariantsSchema.parse(req.body);

  const contentVariants: ContentData[] = variants.map(v => ({
    ...v,
    id: v.id || nanoid(),
    userId,
  }));

  const comparison = await viralScoringService.compareVariants(contentVariants);

  res.json({
    success: true,
    comparison,
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

  res.json({
    success: true,
    timing,
  });
}));

router.get('/optimal-timing-all', requireAuth, asyncHandler(async (req, res) => {
  const { timezone = 'America/New_York' } = req.query;

  const allTimings = await timingOptimizerService.getOptimalTimingForAllPlatforms(
    timezone as string
  );

  res.json({
    success: true,
    timings: allTimings,
  });
}));

router.post('/timing-recommendation', requireAuth, asyncHandler(async (req, res) => {
  const { platform, timezone, targetDate } = timingSchema.parse(req.body);

  const date = targetDate ? new Date(targetDate) : new Date();
  const recommendation = await timingOptimizerService.getTimingRecommendation(
    platform,
    date,
    timezone
  );

  res.json({
    success: true,
    recommendation,
  });
}));

router.post('/audience-patterns', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform } = req.body;

  const patterns = await timingOptimizerService.analyzeAudiencePatterns(
    userId,
    platform
  );

  res.json({
    success: true,
    patterns,
  });
}));

router.get('/competitor-timing/:platform', requireAuth, asyncHandler(async (req, res) => {
  const { platform } = req.params;

  const competitorTiming = await timingOptimizerService.getCompetitorTiming(platform);

  res.json({
    success: true,
    competitorTiming,
  });
}));

router.post('/posting-schedule', requireAuth, asyncHandler(async (req, res) => {
  const { platforms, postsPerWeek = 7, timezone = 'America/New_York' } = req.body;

  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'Platforms array is required' });
  }

  const schedule = await timingOptimizerService.suggestPostingSchedule(
    platforms,
    postsPerWeek,
    timezone
  );

  res.json({
    success: true,
    schedule,
  });
}));

router.post('/generate-variants', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content, count } = generateVariantsSchema.parse(req.body);

  const contentData: ContentData = {
    ...content,
    id: content.id || nanoid(),
    userId,
  };

  const result = await contentVariantGeneratorService.generateVariants(
    contentData as any,
    count
  );

  logger.info(`🎯 Generated ${result.variants.length} variants for user ${userId}`);

  res.json({
    success: true,
    ...result,
  });
}));

router.post('/generate-caption-variants', requireAuth, asyncHandler(async (req, res) => {
  const { caption, count = 5 } = req.body;

  if (!caption) {
    return res.status(400).json({ error: 'Caption is required' });
  }

  const variants = await contentVariantGeneratorService.generateCaptionVariants(
    caption,
    count
  );

  res.json({
    success: true,
    variants,
  });
}));

router.post('/generate-hashtag-sets', requireAuth, asyncHandler(async (req, res) => {
  const { content, count = 5 } = generateVariantsSchema.parse(req.body);

  const hashtagSets = await contentVariantGeneratorService.generateHashtagSets(
    content as any,
    count
  );

  res.json({
    success: true,
    hashtagSets,
  });
}));

router.post('/generate-hooks', requireAuth, asyncHandler(async (req, res) => {
  const { content } = scoreViralSchema.parse(req.body);

  const hooks = await contentVariantGeneratorService.generateHookVariants(content as any);

  res.json({
    success: true,
    hooks,
  });
}));

router.post('/create-ab-test', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { content, variantCount = 2 } = req.body;

  const contentData = {
    ...content,
    id: content.id || nanoid(),
    userId,
  };

  const abTest = await contentVariantGeneratorService.createABTest(
    contentData as any,
    variantCount
  );

  logger.info(`🧪 A/B test created for user ${userId}: ${abTest.testId}`);

  res.json({
    success: true,
    ...abTest,
  });
}));

router.post('/algorithm-health', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform, recentMetrics } = algorithmHealthSchema.parse(req.body);

  const health = await algorithmIntelligenceService.checkAlgorithmHealth(
    platform,
    userId,
    recentMetrics
  );

  res.json({
    success: true,
    health,
  });
}));

router.get('/algorithm-health/:platform', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform } = req.params;

  const validPlatforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'linkedin'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  const health = await algorithmIntelligenceService.checkAlgorithmHealth(platform, userId);

  res.json({
    success: true,
    health,
  });
}));

router.post('/shadowban-check', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform, recentMetrics } = shadowbanCheckSchema.parse(req.body);

  const result = await algorithmIntelligenceService.checkShadowBan(
    platform,
    userId,
    recentMetrics
  );

  logger.info(`🔍 Shadowban check for ${platform}: ${result.isShadowbanned ? 'DETECTED' : 'Clear'}`);

  res.json({
    success: true,
    result,
  });
}));

router.get('/engagement-patterns/:platform', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform } = req.params;

  const patterns = await algorithmIntelligenceService.getEngagementPatterns(platform, userId);

  res.json({
    success: true,
    patterns,
  });
}));

router.get('/platform-profile/:platform', requireAuth, asyncHandler(async (req, res) => {
  const { platform } = req.params;

  const profile = await algorithmIntelligenceService.getPlatformProfile(platform);

  res.json({
    success: true,
    profile,
  });
}));

router.get('/algorithm-insights/:platform', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { platform } = req.params;

  const insights = await algorithmIntelligenceService.getAlgorithmInsights(platform, userId);

  res.json({
    success: true,
    insights,
  });
}));

router.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
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
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  const allRecommendations = [...new Set(
    Object.values(platformHealth)
      .flatMap(h => h.recommendations)
  )].slice(0, 10);

  const growthProjection = {
    current: null,
    projected30Days: null,
    projected90Days: null,
  };

  const viralHighlights = platforms.map(platform => ({
    platform,
    topScore: null,
    avgScore: null,
    viralPotential: null,
  }));

  const heatmapData: Array<{
    dayOfWeek: number;
    hour: number;
    value: number;
    platform: string;
  }> = [];

  for (const platform of platforms) {
    const timing = timingResults[platform];
    if (timing) {
      for (const slot of timing.bestTimes.slice(0, 5)) {
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
      growthProjection,
      viralHighlights,
      heatmapData,
      lastUpdated: new Date().toISOString(),
    },
  });
}));

router.get('/summary', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const defaultPlatform = 'instagram';
  const [health, patterns, insights] = await Promise.all([
    algorithmIntelligenceService.checkAlgorithmHealth(defaultPlatform, userId),
    algorithmIntelligenceService.getEngagementPatterns(defaultPlatform, userId),
    algorithmIntelligenceService.getAlgorithmInsights(defaultPlatform, userId),
  ]);

  res.json({
    success: true,
    summary: {
      healthScore: health.overallScore,
      status: health.status,
      alertCount: health.alerts.filter(a => !a.resolved).length,
      topRecommendation: health.recommendations[0] || 'Keep up the great work!',
      optimalPostFrequency: patterns.optimalPostFrequency,
      benchmarkComparison: insights.benchmarks,
    },
  });
}));

export default router;
