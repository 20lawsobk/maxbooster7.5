import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { autopilotLearningService } from '../services/autopilotLearningService.js';
import { logger } from '../logger.js';

const router = Router();

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

export default router;
