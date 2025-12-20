import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import {
  unifiedAIController,
  type ContentGenerationOptions,
  type SentimentAnalysisOptions,
  type RecommendationOptions,
  type AdOptimizationOptions,
  type EngagementPredictionOptions,
  type ForecastOptions,
} from '../services/unifiedAIController.js';

const router = Router();

router.post('/content/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const options: ContentGenerationOptions = {
      tone: req.body.tone || 'casual',
      platform: req.body.platform || 'twitter',
      maxLength: req.body.maxLength,
      genre: req.body.genre,
      mood: req.body.mood,
      audience: req.body.audience,
      style: req.body.style,
      keywords: req.body.keywords,
      customPrompt: req.body.customPrompt,
      userId: req.user?.id,
      projectId: req.body.projectId,
    };

    const result = await unifiedAIController.generateContent(options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      processingTimeMs: result.processingTimeMs,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('Content generation route error:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

router.post('/sentiment/analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { text, includeEmotions, includeToxicity, includeAspects, aspects } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for sentiment analysis' });
    }

    const options: SentimentAnalysisOptions = {
      text,
      includeEmotions: includeEmotions ?? false,
      includeToxicity: includeToxicity ?? false,
      includeAspects: includeAspects ?? false,
      aspects,
    };

    const result = await unifiedAIController.analyzeSentiment(options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      processingTimeMs: result.processingTimeMs,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('Sentiment analysis route error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

router.post('/recommendations/get', requireAuth, async (req: Request, res: Response) => {
  try {
    const { type, seedIds, limit, hybridWeight } = req.body;

    if (!type || !['tracks', 'artists', 'similar'].includes(type)) {
      return res.status(400).json({ error: 'Valid recommendation type is required (tracks, artists, similar)' });
    }

    const options: RecommendationOptions = {
      userId: req.user?.id,
      type,
      seedIds,
      limit: limit ?? 20,
      hybridWeight: hybridWeight ?? 0.5,
    };

    const result = await unifiedAIController.getRecommendations(options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      processingTimeMs: result.processingTimeMs,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('Recommendations route error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

router.post('/ads/optimize', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaign, action, campaigns, totalBudget, forecastPeriod } = req.body;

    if (!campaign) {
      return res.status(400).json({ error: 'Campaign data is required' });
    }

    if (!action || !['score', 'optimize_budget', 'predict_creative', 'forecast_roi'].includes(action)) {
      return res.status(400).json({ error: 'Valid action is required (score, optimize_budget, predict_creative, forecast_roi)' });
    }

    const options: AdOptimizationOptions = {
      campaign,
      action,
      campaigns,
      totalBudget,
      forecastPeriod,
    };

    const result = await unifiedAIController.optimizeAd(options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      processingTimeMs: result.processingTimeMs,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('Ad optimization route error:', error);
    res.status(500).json({ error: 'Failed to optimize ads' });
  }
});

router.post('/social/predict', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platform, content, action, postsPerWeek } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }

    if (!action || !['predict_engagement', 'viral_potential', 'best_time', 'recommend_type', 'optimize_schedule'].includes(action)) {
      return res.status(400).json({ error: 'Valid action is required (predict_engagement, viral_potential, best_time, recommend_type, optimize_schedule)' });
    }

    const options: EngagementPredictionOptions = {
      platform,
      content: {
        text: content?.text ?? '',
        contentType: content?.contentType ?? 'text',
        hashtags: content?.hashtags ?? [],
        topics: content?.topics ?? [],
        hasEmoji: content?.hasEmoji ?? false,
        scheduledTime: content?.scheduledTime,
      },
      action,
      postsPerWeek,
    };

    const result = await unifiedAIController.predictEngagement(options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      processingTimeMs: result.processingTimeMs,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('Social prediction route error:', error);
    res.status(500).json({ error: 'Failed to predict social engagement' });
  }
});

router.post('/forecast', requireAuth, async (req: Request, res: Response) => {
  try {
    const { metric, horizon, historicalData, timestamps } = req.body;

    if (!metric || !['streams', 'revenue', 'followers', 'engagement'].includes(metric)) {
      return res.status(400).json({ error: 'Valid metric is required (streams, revenue, followers, engagement)' });
    }

    if (!horizon || ![7, 30, 90].includes(horizon)) {
      return res.status(400).json({ error: 'Valid horizon is required (7, 30, or 90 days)' });
    }

    if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 10) {
      return res.status(400).json({ error: 'At least 10 historical data points are required' });
    }

    const options: ForecastOptions = {
      metric,
      horizon,
      historicalData,
      timestamps: timestamps?.map((t: string) => new Date(t)),
    };

    const result = await unifiedAIController.forecastMetrics(options);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data,
      processingTimeMs: result.processingTimeMs,
      confidence: result.confidence,
    });
  } catch (error) {
    logger.error('Forecast route error:', error);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

router.get('/health', requireAuth, async (req: Request, res: Response) => {
  try {
    const health = await unifiedAIController.getAIHealthStatus();
    
    const statusCode = health.overall === 'healthy' ? 200 : 
                       health.overall === 'degraded' ? 207 : 503;

    res.status(statusCode).json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error('AI health check route error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get AI health status',
      data: {
        overall: 'unhealthy',
        lastChecked: new Date(),
        services: {},
        modelStats: { registeredModels: 0, activeModels: 0, trainedModels: 0 },
      },
    });
  }
});

router.post('/hashtags/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { topic, genre, platform, tone, count } = req.body;

    const hashtags = unifiedAIController.generateHashtags({
      topic,
      genre,
      platform,
      tone,
      count: count ?? 10,
    });

    res.json({
      success: true,
      data: { hashtags },
    });
  } catch (error) {
    logger.error('Hashtag generation route error:', error);
    res.status(500).json({ error: 'Failed to generate hashtags' });
  }
});

router.post('/toxicity/analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for toxicity analysis' });
    }

    const result = unifiedAIController.analyzeToxicity(text);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Toxicity analysis route error:', error);
    res.status(500).json({ error: 'Failed to analyze toxicity' });
  }
});

router.post('/emotions/detect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for emotion detection' });
    }

    const result = unifiedAIController.detectEmotions(text);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Emotion detection route error:', error);
    res.status(500).json({ error: 'Failed to detect emotions' });
  }
});

router.get('/trends', requireAuth, async (req: Request, res: Response) => {
  try {
    const platforms = req.query.platforms 
      ? (req.query.platforms as string).split(',') 
      : ['twitter', 'instagram', 'tiktok'];

    const trends = unifiedAIController.detectTrends(platforms as any);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    logger.error('Trends detection route error:', error);
    res.status(500).json({ error: 'Failed to detect trends' });
  }
});

router.post('/content/adapt', requireAuth, async (req: Request, res: Response) => {
  try {
    const { content, originalPlatform, targetPlatform } = req.body;

    if (!content || !originalPlatform || !targetPlatform) {
      return res.status(400).json({ error: 'Content, originalPlatform, and targetPlatform are required' });
    }

    const adaptedContent = unifiedAIController.adaptContent(
      content,
      originalPlatform,
      targetPlatform
    );

    res.json({
      success: true,
      data: adaptedContent,
    });
  } catch (error) {
    logger.error('Content adaptation route error:', error);
    res.status(500).json({ error: 'Failed to adapt content' });
  }
});

router.get('/models', requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query;
    
    const models = await unifiedAIController.getRegisteredModels({
      status: status as string,
      type: type as string,
    });

    res.json({
      success: true,
      data: models,
    });
  } catch (error) {
    logger.error('Get models route error:', error);
    res.status(500).json({ error: 'Failed to get registered models' });
  }
});

router.get('/models/:modelId/performance', requireAuth, async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    
    const performance = await unifiedAIController.getModelPerformance(modelId);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    logger.error('Get model performance route error:', error);
    res.status(500).json({ error: 'Failed to get model performance' });
  }
});

router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = unifiedAIController.getServiceStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Get AI stats route error:', error);
    res.status(500).json({ error: 'Failed to get AI stats' });
  }
});

router.post('/analytics/predict', requireAuth, async (req: Request, res: Response) => {
  try {
    const { metric, timeframe } = req.body;

    if (!metric || !['streams', 'engagement', 'revenue'].includes(metric)) {
      return res.status(400).json({ error: 'Valid metric is required (streams, engagement, revenue)' });
    }

    if (!timeframe || !['7d', '30d', '90d'].includes(timeframe)) {
      return res.status(400).json({ error: 'Valid timeframe is required (7d, 30d, 90d)' });
    }

    const prediction = await unifiedAIController.predictAnalyticsMetric({ metric, timeframe });

    res.json({
      success: true,
      data: prediction,
    });
  } catch (error) {
    logger.error('Analytics prediction route error:', error);
    res.status(500).json({ error: 'Failed to predict analytics metric' });
  }
});

router.get('/insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const insights = await unifiedAIController.generateInsights();

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger.error('Generate insights route error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

router.get('/anomalies', requireAuth, async (req: Request, res: Response) => {
  try {
    const anomalies = await unifiedAIController.detectAnomalies();

    res.json({
      success: true,
      data: anomalies,
    });
  } catch (error) {
    logger.error('Detect anomalies route error:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

router.post('/churn/predict', requireAuth, async (req: Request, res: Response) => {
  try {
    const prediction = await unifiedAIController.predictChurn();

    res.json({
      success: true,
      data: prediction,
    });
  } catch (error) {
    logger.error('Churn prediction route error:', error);
    res.status(500).json({ error: 'Failed to predict churn' });
  }
});

router.post('/revenue/forecast', requireAuth, async (req: Request, res: Response) => {
  try {
    const { timeframe } = req.body;
    
    const forecast = await unifiedAIController.forecastRevenue(timeframe || '30d');

    res.json({
      success: true,
      data: forecast,
    });
  } catch (error) {
    logger.error('Revenue forecast route error:', error);
    res.status(500).json({ error: 'Failed to forecast revenue' });
  }
});

// ============================================================================
// PERSONAL AD NETWORK - ORGANIC GROWTH ENDPOINTS
// Achieve paid-ad-level results without ad spend
// ============================================================================

router.post('/organic/optimize', requireAuth, async (req: Request, res: Response) => {
  try {
    const { profiles, content, goals } = req.body;

    if (!profiles || !Array.isArray(profiles)) {
      return res.status(400).json({ error: 'Social profiles array is required' });
    }

    if (!content || !content.text) {
      return res.status(400).json({ error: 'Content with text is required' });
    }

    const result = await unifiedAIController.optimizeOrganicGrowth({
      profiles,
      content,
      goals: goals || {},
    });

    res.json({
      success: true,
      data: result,
      message: 'Personal Ad Network optimization complete',
    });
  } catch (error) {
    logger.error('Organic optimization route error:', error);
    res.status(500).json({ error: 'Failed to optimize organic growth' });
  }
});

router.post('/organic/roi', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platformResults } = req.body;

    if (!platformResults) {
      return res.status(400).json({ error: 'Platform results data is required' });
    }

    const result = await unifiedAIController.calculateOrganicROI({
      platformResults,
      totalReach: Object.values(platformResults as Record<string, { impressions: number }>)
        .reduce((sum: number, p: { impressions: number }) => sum + p.impressions, 0),
      totalEngagements: Object.values(platformResults as Record<string, { engagements: number }>)
        .reduce((sum: number, p: { engagements: number }) => sum + p.engagements, 0),
    });

    res.json({
      success: true,
      data: result,
      message: 'Organic ROI calculated - see equivalent ad spend savings',
    });
  } catch (error) {
    logger.error('Organic ROI route error:', error);
    res.status(500).json({ error: 'Failed to calculate organic ROI' });
  }
});

router.post('/organic/schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const { profiles, contentQueue, goals } = req.body;

    if (!profiles || !Array.isArray(profiles)) {
      return res.status(400).json({ error: 'Social profiles array is required' });
    }

    if (!contentQueue || !Array.isArray(contentQueue)) {
      return res.status(400).json({ error: 'Content queue array is required' });
    }

    const result = await unifiedAIController.generateOrganicSchedule({
      profiles,
      contentQueue,
      goals: goals || {},
    });

    res.json({
      success: true,
      data: result,
      message: 'Optimal organic posting schedule generated',
    });
  } catch (error) {
    logger.error('Organic schedule route error:', error);
    res.status(500).json({ error: 'Failed to generate organic schedule' });
  }
});

router.get('/organic/network-analysis', requireAuth, async (req: Request, res: Response) => {
  try {
    const networkAnalysis = await unifiedAIController.analyzePersonalAdNetwork(req.user?.id);

    res.json({
      success: true,
      data: networkAnalysis,
      message: 'Personal Ad Network analysis complete',
    });
  } catch (error) {
    logger.error('Network analysis route error:', error);
    res.status(500).json({ error: 'Failed to analyze personal ad network' });
  }
});

export default router;
