import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { aiModelManager } from '../services/aiModelManager.js';
import { promotionalToolsService } from '../services/promotionalToolsService.js';
import { MaxCoreAIClient } from '../services/unifiedAIController.js';

const router = Router();

// Configuration schema
const autopilotConfigSchema = z.object({
  enabled: z.boolean(),
  platforms: z.array(z.string()).optional(),
  postingFrequency: z.enum(['hourly', 'daily', 'weekly']).optional(),
  brandVoice: z.string().optional(),
  contentTypes: z.array(z.string()).optional(),
  autoPublish: z.boolean().optional(),
  useMultimodalAnalysis: z.boolean().default(true),
  autoAnalyzeBeforePosting: z.boolean().default(true),
  minConfidenceThreshold: z.number().min(0).max(1).default(0.7),
  topics: z.array(z.string()).optional(),
  mediaTypes: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  businessGoals: z.array(z.string()).optional(),
  optimalTimesOnly: z.boolean().optional(),
  crossPostingEnabled: z.boolean().optional(),
  engagementThreshold: z.number().min(0).max(1).optional(),
});

// Get autopilot status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const config = await storage.getAutopilotConfig(userId);
    
    const socialModel = await aiModelManager.getSocialAutopilot(userId);
    const advertisingModel = await aiModelManager.getAdvertisingAutopilot(userId);
    
    res.json({
      isRunning: config?.enabled || false,
      config: config || {
        enabled: false,
        platforms: [],
        postingFrequency: 'daily',
        brandVoice: 'professional',
        contentTypes: ['tips', 'insights'],
        autoPublish: false,
        useMultimodalAnalysis: true,
        autoAnalyzeBeforePosting: true,
        minConfidenceThreshold: 0.70,
      },
      modelStatus: {
        social: {
          trained: socialModel.getIsTrained(),
          version: socialModel.getVersion(),
        },
        advertising: {
          trained: advertisingModel.getIsTrained(),
          version: advertisingModel.getVersion(),
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get autopilot status:', error);
    res.status(500).json({ error: 'Failed to get autopilot status' });
  }
});

// Start autopilot
router.post('/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    let config = await storage.getAutopilotConfig(userId);
    if (!config) {
      config = {
        enabled: true,
        platforms: ['facebook', 'instagram', 'twitter'],
        postingFrequency: 'daily',
        brandVoice: 'professional',
        contentTypes: ['tips', 'insights'],
        autoPublish: false,
        useMultimodalAnalysis: true,
        autoAnalyzeBeforePosting: true,
        minConfidenceThreshold: 0.70,
      };
    } else {
      config.enabled = true;
      if (config.autoAnalyzeBeforePosting === undefined || config.autoAnalyzeBeforePosting === null) {
        config.autoAnalyzeBeforePosting = true;
      }
      if (config.minConfidenceThreshold === undefined || config.minConfidenceThreshold === null) {
        config.minConfidenceThreshold = 0.70;
      }
    }
    
    await storage.saveAutopilotConfig(userId, config);

    setImmediate(async () => {
      try {
        const engine = promotionalToolsService.getAutopilotForUser(userId);
        await engine.configure({
          enabled: true,
          platforms: config.platforms || ['instagram', 'twitter'],
          postingFrequency: config.postingFrequency || 'daily',
          brandVoice: config.brandVoice || 'professional',
          contentTypes: config.contentTypes || ['tips', 'insights'],
          autoPublish: config.autoPublish || false,
        });
        logger.info(`✅ Autopilot engine started for user ${userId}`);
      } catch (err) {
        logger.warn(`⚠️ Autopilot engine start failed for user ${userId}:`, err);
      }
    });
    
    logger.info(`✅ Autopilot started for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Autopilot activated',
      config,
    });
  } catch (error) {
    logger.error('Failed to start autopilot:', error);
    res.status(500).json({ error: 'Failed to start autopilot' });
  }
});

// Stop autopilot
router.post('/stop', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const config = await storage.getAutopilotConfig(userId);
    if (config) {
      config.enabled = false;
      await storage.saveAutopilotConfig(userId, config);
    }

    setImmediate(async () => {
      try {
        const engine = promotionalToolsService.getAutopilotForUser(userId);
        await engine.configure({ enabled: false });
        logger.info(`⏸️ Autopilot engine stopped for user ${userId}`);
      } catch (err) {
        logger.warn(`⚠️ Autopilot engine stop failed for user ${userId}:`, err);
      }
    });
    
    logger.info(`⏸️ Autopilot stopped for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Autopilot paused',
    });
  } catch (error) {
    logger.error('Failed to stop autopilot:', error);
    res.status(500).json({ error: 'Failed to stop autopilot' });
  }
});

// Configure autopilot
router.post('/configure', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const config = autopilotConfigSchema.parse(req.body);
    
    await storage.saveAutopilotConfig(userId, config);

    if (config.enabled) {
      setImmediate(async () => {
        try {
          const engine = promotionalToolsService.getAutopilotForUser(userId);
          await engine.configure({
            enabled: config.enabled,
            platforms: config.platforms || [],
            postingFrequency: config.postingFrequency || 'daily',
            brandVoice: config.brandVoice || 'professional',
            contentTypes: config.contentTypes || [],
            autoPublish: config.autoPublish || false,
          });
        } catch (err) {
          logger.warn(`⚠️ Autopilot engine configure failed for user ${userId}:`, err);
        }
      });
    }
    
    logger.info(`⚙️ Autopilot configured for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Configuration updated',
      config,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid configuration', details: error.errors });
      return;
    }
    logger.error('Failed to configure autopilot:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Generate AI content recommendations using multimodal analysis
router.post('/recommend', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { contentType, includeMultimodal } = req.body;
    
    const socialModel = await aiModelManager.getSocialAutopilot(userId);
    
    let multimodalFeatures = null;
    if (includeMultimodal !== false) {
      const recentAnalyzedContent = await storage.getRecentAnalyzedContent(userId, 10);
      if (recentAnalyzedContent && recentAnalyzedContent.length > 0) {
        multimodalFeatures = recentAnalyzedContent[0].features;
      }
    }
    
    const recommendations = await socialModel.generateContentRecommendations(
      contentType || 'general',
      multimodalFeatures
    );
    
    res.json({
      success: true,
      recommendations,
      usedMultimodal: !!multimodalFeatures,
    });
  } catch (error) {
    logger.error('Failed to generate recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Predict engagement for content with multimodal features
router.post('/predict-engagement', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform, content, multimodalFeatures } = req.body;
    
    if (!platform || !content) {
      res.status(400).json({ error: 'Platform and content are required' });
      return;
    }
    
    const socialModel = await aiModelManager.getSocialAutopilot(userId);
    
    const emojiRegex = new RegExp('[\\u{1F300}-\\u{1F9FF}]|[\\\u{2600}-\\u{26FF}]|[\\\u{2700}-\\u{27BF}]', 'u');
    const features = {
      platform,
      contentLength: content.length,
      hasHashtags: content.includes('#'),
      hasEmojis: emojiRegex.test(content),
      hasLinks: content.includes('http'),
      ...multimodalFeatures,
    };
    
    const prediction = await socialModel.predictEngagement(features);
    
    res.json({
      success: true,
      prediction,
      usedMultimodal: !!multimodalFeatures,
    });
  } catch (error) {
    logger.error('Failed to predict engagement:', error);
    res.status(500).json({ error: 'Failed to predict engagement' });
  }
});

// Save analyzed content features for autopilot training
router.post('/save-features', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { contentType, features, contentUrl, contentText } = req.body;
    
    if (!contentType || !features) {
      res.status(400).json({ error: 'Content type and features are required' });
      return;
    }
    
    const featuresToSave: any = {
      contentType,
      contentUrl,
      contentText,
    };
    
    if (contentType === 'image') {
      featuresToSave.imageComposition = features.composition;
      featuresToSave.imageColors = features.colors;
      featuresToSave.imageEngagement = features.engagement;
      featuresToSave.imageQuality = features.quality;
    } else if (contentType === 'video') {
      featuresToSave.videoTechnical = features.technical;
      featuresToSave.videoContent = features.content;
      featuresToSave.videoEngagement = features.engagement;
      featuresToSave.videoThumbnail = features.thumbnail;
    } else if (contentType === 'audio') {
      featuresToSave.audioTechnical = features.technical;
      featuresToSave.audioEngagement = features.engagement;
      featuresToSave.audioMood = features.mood;
    } else if (contentType === 'text') {
      featuresToSave.textSentiment = features.sentiment;
      featuresToSave.textReadability = features.readability;
      featuresToSave.textEngagement = features.engagement;
      featuresToSave.textKeywords = features.keywords;
    } else if (contentType === 'website') {
      featuresToSave.websiteTechnical = features.technical;
      featuresToSave.websiteContent = features.content;
      featuresToSave.websiteEngagement = features.engagement;
      featuresToSave.websiteSeo = features.seo;
    }
    
    const featureId = await storage.saveAnalyzedContentFeatures(userId, featuresToSave);
    
    logger.info(`✅ Saved ${contentType} features for user ${userId} autopilot training`);
    
    res.json({
      success: true,
      message: 'Features saved for autopilot training',
      featureId,
    });
  } catch (error) {
    logger.error('Failed to save features:', error);
    res.status(500).json({ error: 'Failed to save features for training' });
  }
});

// Train autopilot AI with user's historical data + analyzed multimodal features
router.post('/train', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    logger.info(`🤖 Starting autopilot AI training for user ${userId} with multimodal features...`);
    
    const posts = await storage.getAllPosts(userId);
    const campaigns = await storage.getAllCampaigns(userId);
    const analyzedFeatures = await storage.getAnalyzedContentForTraining(userId);
    
    logger.info(`📊 Loaded ${posts.length} posts, ${campaigns.length} campaigns, ${analyzedFeatures.length} analyzed features`);
    
    const socialModel = await aiModelManager.getSocialAutopilot(userId);
    const advertisingModel = await aiModelManager.getAdvertisingAutopilot(userId);
    
    const enrichedPosts = socialModel.enrichPostsWithAnalyzedFeatures(posts, analyzedFeatures);
    logger.info(`✅ Enriched ${enrichedPosts.filter((p: any) => p.contentAnalysis).length} posts with multimodal features`);
    
    const enrichedCampaigns = advertisingModel.enrichCampaignsWithAnalyzedFeatures(campaigns, analyzedFeatures);
    logger.info(`✅ Enriched ${enrichedCampaigns.filter((c: any) => c.contentAnalysis).length} campaigns with multimodal features`);
    
    let socialResult = null;
    let advertisingResult = null;
    
    try {
      if (enrichedPosts.length >= 50) {
        socialResult = await socialModel.trainOnUserEngagementData(enrichedPosts);
        logger.info(`✅ Social autopilot trained: ${socialResult.postsProcessed} posts`);
      } else {
        logger.warn(`⚠️ Not enough posts for social training (${enrichedPosts.length}/50)`);
      }
    } catch (error: any) {
      logger.error('Social model training failed:', error);
    }
    
    try {
      if (enrichedCampaigns.length >= 30) {
        advertisingResult = await advertisingModel.trainOnHistoricalCampaigns(enrichedCampaigns);
        logger.info(`✅ Advertising autopilot trained: ${advertisingResult.campaignsProcessed} campaigns`);
      } else {
        logger.warn(`⚠️ Not enough campaigns for advertising training (${enrichedCampaigns.length}/30)`);
      }
    } catch (error: any) {
      logger.error('Advertising model training failed:', error);
    }
    
    res.json({
      success: true,
      message: 'Autopilot AI training completed with multimodal features',
      results: {
        social: socialResult,
        advertising: advertisingResult,
      },
      dataUsed: {
        posts: enrichedPosts.length,
        campaigns: enrichedCampaigns.length,
        analyzedFeatures: analyzedFeatures.length,
        enrichedPosts: enrichedPosts.filter((p: any) => p.contentAnalysis).length,
        enrichedCampaigns: enrichedCampaigns.filter((c: any) => c.contentAnalysis).length,
      },
    });
  } catch (error) {
    logger.error('Failed to train autopilot:', error);
    res.status(500).json({ error: 'Failed to train autopilot AI' });
  }
});

export default router;
