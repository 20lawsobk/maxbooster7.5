import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { autopilotLearningService } from '../services/autopilotLearningService.js';
import { hyperLearningEngine } from '../services/hyperLearningEngine.js';
import { logger } from '../logger.js';

const router = Router();

// Delay first learning cycle by 90 seconds so it doesn't compete with
// cold-start DB connections and slow down the initial page load.
setTimeout(() => {
  hyperLearningEngine.start().catch(err => {
    logger.warn('HyperLearning Engine failed to auto-start:', err);
  });
}, 90_000);

router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const hyperStatus = hyperLearningEngine.getStatus();
    const metrics = hyperLearningEngine.getMetrics();

    const [insights, recommendations, performance, platformStats] = await Promise.all([
      autopilotLearningService.getLearningInsights(userId),
      autopilotLearningService.getRecommendations(userId),
      autopilotLearningService.getPerformanceHistory(userId, { limit: 1 }),
      autopilotLearningService.getPlatformStatistics(userId),
    ]);

    res.json({
      success: true,
      learning: {
        isActive: hyperStatus.isRunning,
        totalDataPoints: metrics.totalDataPointsProcessed,
        patternsDetected: metrics.patternsDetected,
        microPatternsFound: metrics.microPatternsFound,
        learningMultiplier: `${metrics.learningMultiplier.toFixed(1)}x`,
        lastLearningCycle: hyperStatus.metrics.lastCycleAt || null,
        processingTimeMs: metrics.actualProcessingTimeMs,
        humanEquivalentHours: metrics.humanEquivalentHours,
      },
      insights: {
        total: insights.length,
        types: insights.reduce((acc: Record<string, number>, i) => {
          acc[i.type] = (acc[i.type] || 0) + 1;
          return acc;
        }, {}),
      },
      recommendations: {
        total: recommendations.length,
        actionable: recommendations.filter(r => r.actionable).length,
      },
      performance: {
        totalRecorded: performance.total,
        platformsCovered: platformStats.length,
        platforms: platformStats.map(p => ({
          platform: p.platform,
          postCount: p.postCount,
          avgEngagement: p.avgEngagement,
        })),
      },
      capabilities: [
        'performance_tracking',
        'pattern_detection',
        'optimal_timing',
        'content_recommendations',
        'hyper_learning',
        'micro_pattern_analysis',
        'cross_platform_synthesis',
        'predictive_modeling',
      ],
    });
  } catch (error) {
    logger.error('Failed to get autopilot learning status:', error);
    res.status(500).json({ error: 'Failed to get autopilot learning status' });
  }
});

const recordPerformanceSchema = z.object({
  platform: z.string(),
  contentType: z.string().optional(),
  hookType: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  contentText: z.string().optional(),
  mediaType: z.string().optional(),
  postId: z.string().optional(),
  postedAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
  analytics: z.object({
    impressions: z.number().optional(),
    clicks: z.number().optional(),
    shares: z.number().optional(),
    likes: z.number().optional(),
    comments: z.number().optional(),
    saves: z.number().optional(),
    reach: z.number().optional(),
    engagementRate: z.number().optional(),
  }),
});

router.get('/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const insights = await autopilotLearningService.getLearningInsights(userId);
    
    res.json({
      success: true,
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get learning insights:', error);
    res.status(500).json({ error: 'Failed to get learning insights' });
  }
});

router.get('/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const recommendations = await autopilotLearningService.getRecommendations(userId);
    
    res.json({
      success: true,
      recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    logger.error('Failed to get recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

router.get('/performance', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform, limit, offset } = req.query;
    
    const result = await autopilotLearningService.getPerformanceHistory(userId, {
      platform: platform as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    
    res.json({
      success: true,
      data: result.data,
      total: result.total,
      pagination: {
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get performance history:', error);
    res.status(500).json({ error: 'Failed to get performance history' });
  }
});

router.post('/record', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = recordPerformanceSchema.parse(req.body);
    
    const postData = {
      platform: data.platform,
      contentType: data.contentType,
      hookType: data.hookType,
      hashtags: data.hashtags,
      contentText: data.contentText,
      mediaType: data.mediaType,
      postId: data.postId,
      postedAt: data.postedAt ? new Date(data.postedAt) : undefined,
      metadata: data.metadata,
    };
    
    const recordId = await autopilotLearningService.recordPerformance(
      userId,
      postData,
      data.analytics
    );
    
    res.json({
      success: true,
      recordId,
      message: 'Performance data recorded successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.errors });
      return;
    }
    logger.error('Failed to record performance:', error);
    res.status(500).json({ error: 'Failed to record performance data' });
  }
});

router.get('/optimal-times/:platform', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params;
    
    const optimalTimes = await autopilotLearningService.getOptimalPostingTimes(userId, platform);
    
    res.json({
      success: true,
      platform,
      optimalTimes,
    });
  } catch (error) {
    logger.error('Failed to get optimal posting times:', error);
    res.status(500).json({ error: 'Failed to get optimal posting times' });
  }
});

router.get('/top-content', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.query;
    
    const topContentTypes = await autopilotLearningService.getTopPerformingContentTypes(
      userId,
      platform as string | undefined
    );
    
    res.json({
      success: true,
      contentTypes: topContentTypes,
    });
  } catch (error) {
    logger.error('Failed to get top performing content types:', error);
    res.status(500).json({ error: 'Failed to get top performing content types' });
  }
});

router.get('/patterns', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const patterns = await autopilotLearningService.detectPatterns(userId);
    
    res.json({
      success: true,
      patterns,
    });
  } catch (error) {
    logger.error('Failed to detect patterns:', error);
    res.status(500).json({ error: 'Failed to detect patterns' });
  }
});

router.get('/platform-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await autopilotLearningService.getPlatformStatistics(userId);
    
    res.json({
      success: true,
      platforms: stats,
    });
  } catch (error) {
    logger.error('Failed to get platform statistics:', error);
    res.status(500).json({ error: 'Failed to get platform statistics' });
  }
});

router.post('/generate-insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await autopilotLearningService.generateInsights(userId);
    
    const insights = await autopilotLearningService.getLearningInsights(userId);
    
    res.json({
      success: true,
      message: 'Insights generated successfully',
      insights,
    });
  } catch (error) {
    logger.error('Failed to generate insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

router.get('/hyper/status', requireAuth, async (req, res) => {
  try {
    const status = hyperLearningEngine.getStatus();
    
    res.json({
      success: true,
      hyperLearning: {
        enabled: true,
        learningMultiplier: `${status.metrics.learningMultiplier.toFixed(1)}x`,
        description: 'AI-powered learning system that analyzes patterns 3x faster than human capability',
        ...status,
      },
    });
  } catch (error) {
    logger.error('Failed to get hyper learning status:', error);
    res.status(500).json({ error: 'Failed to get hyper learning status' });
  }
});

router.get('/hyper/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const hyperInsights = await hyperLearningEngine.getHyperInsights(userId);
    const metrics = hyperLearningEngine.getMetrics();
    
    res.json({
      success: true,
      hyperInsights,
      count: hyperInsights.length,
      metrics: {
        learningMultiplier: metrics.learningMultiplier,
        humanEquivalentHours: metrics.humanEquivalentHours,
        actualProcessingMs: metrics.actualProcessingTimeMs,
        efficiency: `${(metrics.humanEquivalentHours * 3600000 / Math.max(1, metrics.actualProcessingTimeMs)).toFixed(1)}x faster than human`,
      },
      capabilities: {
        microPatternDetection: 'Detects 15+ subtle content patterns humans miss',
        crossPlatformSynthesis: 'Combines learning across all platforms simultaneously',
        predictiveModeling: 'Predicts engagement before posting',
        realTimeAdaptation: 'Adjusts strategies 24/7 without breaks',
        acceleratedABTesting: 'Runs multiple experiments in parallel',
      },
    });
  } catch (error) {
    logger.error('Failed to get hyper insights:', error);
    res.status(500).json({ error: 'Failed to get hyper insights' });
  }
});

router.get('/hyper/predict/:platform', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params;
    
    const prediction = await hyperLearningEngine.predictOptimalContent(userId, platform);
    
    res.json({
      success: true,
      platform,
      prediction,
      explanation: {
        timing: `Post on day ${prediction.optimalTiming.dayOfWeek} at ${prediction.optimalTiming.hour}:00 for best results`,
        hook: `Start with a ${prediction.optimalHook} hook`,
        length: `Keep content at ${prediction.optimalLength}`,
        emojis: `Use ${prediction.optimalEmojiDensity}`,
        hashtags: `Include ${prediction.optimalHashtagCount} hashtags`,
        expectedEngagement: `Predicted engagement rate: ${prediction.predictedEngagement.toFixed(2)}%`,
      },
      microPatternRecommendations: prediction.microPatternRecommendations,
    });
  } catch (error) {
    logger.error('Failed to predict optimal content:', error);
    res.status(500).json({ error: 'Failed to predict optimal content' });
  }
});

router.get('/hyper/metrics', requireAuth, async (req, res) => {
  try {
    const metrics = hyperLearningEngine.getMetrics();
    
    res.json({
      success: true,
      metrics,
      analysis: {
        patternsPerHour: metrics.patternsDetected / Math.max(1, metrics.actualProcessingTimeMs / 3600000),
        dataPointsPerSecond: metrics.totalDataPointsProcessed / Math.max(1, metrics.actualProcessingTimeMs / 1000),
        microPatternDepth: metrics.microPatternsFound,
        predictionAccuracy: 'Improving with each learning cycle',
      },
      comparison: {
        humanAnalyst: {
          patternsPerHour: 3,
          dimensionsAnalyzed: 5,
          workHoursPerDay: 8,
          breakRequired: true,
        },
        hyperLearning: {
          patternsPerHour: Math.round(metrics.patternsDetected / Math.max(1, metrics.actualProcessingTimeMs / 3600000)),
          dimensionsAnalyzed: 15,
          workHoursPerDay: 24,
          breakRequired: false,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get hyper metrics:', error);
    res.status(500).json({ error: 'Failed to get hyper metrics' });
  }
});

router.post('/hyper/start', requireAuth, async (req, res) => {
  try {
    await hyperLearningEngine.start();
    const status = hyperLearningEngine.getStatus();
    
    res.json({
      success: true,
      message: 'HyperLearning Engine started',
      status,
    });
  } catch (error) {
    logger.error('Failed to start hyper learning:', error);
    res.status(500).json({ error: 'Failed to start hyper learning' });
  }
});

router.post('/hyper/stop', requireAuth, async (req, res) => {
  try {
    await hyperLearningEngine.stop();
    
    res.json({
      success: true,
      message: 'HyperLearning Engine stopped',
    });
  } catch (error) {
    logger.error('Failed to stop hyper learning:', error);
    res.status(500).json({ error: 'Failed to stop hyper learning' });
  }
});

export default router;
