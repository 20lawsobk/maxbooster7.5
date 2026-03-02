import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { unifiedAIController } from '../services/unifiedAIController.js';
import { storage } from '../storage.js';
import { notificationService } from '../services/notificationService.js';
import { pythonAIService } from '../services/pythonAIService.js';
import { db } from '../db.js';
import { eq, desc, sql } from 'drizzle-orm';
import { adCampaigns } from '@shared/schema';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const router = Router();

router.get('/campaigns', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const campaigns = await storage.getAdvertisingCampaigns(userId);
    res.json(campaigns);
  } catch (error) {
    logger.error('Failed to get campaigns:', error);
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
});

router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getAdvertisingInsights(userId);
    res.json(insights);
  } catch (error) {
    logger.error('Failed to get AI insights:', error);
    res.status(500).json({ error: 'Failed to get AI insights' });
  }
});

router.get('/audience-segments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const segments = await storage.getAudienceSegments(userId);
    res.json({ segments });
  } catch (error) {
    logger.error('Failed to get audience segments:', error);
    res.status(500).json({ error: 'Failed to get audience segments' });
  }
});

router.get('/creative-fatigue', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const creatives = await storage.getCreativeFatigue(userId);
    res.json({ creatives });
  } catch (error) {
    logger.error('Failed to get creative fatigue:', error);
    res.status(500).json({ error: 'Failed to get creative fatigue' });
  }
});

router.get('/bidding-strategies', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const strategies = await storage.getBiddingStrategies(userId);
    res.json({ strategies });
  } catch (error) {
    logger.error('Failed to get bidding strategies:', error);
    res.status(500).json({ error: 'Failed to get bidding strategies' });
  }
});

router.get('/lookalike-audiences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const audiences = await storage.getLookalikeAudiences(userId);
    res.json({ audiences });
  } catch (error) {
    logger.error('Failed to get lookalike audiences:', error);
    res.status(500).json({ error: 'Failed to get lookalike audiences' });
  }
});

router.get('/forecasts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const forecasts = await storage.getAdvertisingForecasts(userId);
    res.json({ forecasts: forecasts ? [forecasts] : [] });
  } catch (error) {
    logger.error('Failed to get forecasts:', error);
    res.status(500).json({ error: 'Failed to get forecasts' });
  }
});

router.get('/competitor-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getCompetitorInsights(userId);
    res.json({ insights });
  } catch (error) {
    logger.error('Failed to get competitor insights:', error);
    res.status(500).json({ error: 'Failed to get competitor insights' });
  }
});

router.get('/ab-tests', requireAuth, async (req, res) => {
  try {
    res.json({ tests: [] });
  } catch (error) {
    logger.error('Failed to get A/B tests:', error);
    res.status(500).json({ error: 'Failed to get A/B tests' });
  }
});

router.post('/campaigns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, platform, objective, startDate, endDate, targetAudience, creativeIds } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Campaign name is required' });
    }
    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({ error: 'Platform is required' });
    }

    const [campaign] = await db
      .insert(adCampaigns)
      .values({
        userId,
        name,
        platform,
        objective: objective || null,
        budget: 0,
        dailyBudget: null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        targetAudience: targetAudience || null,
        creativeIds: Array.isArray(creativeIds) ? creativeIds : [],
        status: 'draft',
      })
      .returning();

    setImmediate(async () => {
      try {
        await notificationService.sendAdCampaignCreatedNotification(userId, name);
      } catch (err) {
        logger.error('Ad campaign created notification error:', err);
      }
    });

    res.status(201).json({ success: true, campaign });
  } catch (error) {
    logger.error('Failed to create campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.post('/upload-image', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, url: '' });
  } catch (error) {
    logger.error('Failed to upload image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Status endpoint
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({
        platform: adCampaigns.platform,
        status: adCampaigns.status,
        budget: adCampaigns.budget,
      })
      .from(adCampaigns)
      .where(eq(adCampaigns.userId, userId));

    const activeCampaigns = campaigns.filter(c => c.status === 'active');
    const connectedPlatforms = [...new Set(activeCampaigns.map(c => c.platform))];
    const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);

    res.json({
      status: activeCampaigns.length > 0 ? 'active' : 'inactive',
      connectedPlatforms,
      budget: totalBudget,
      spent: 0,
    });
  } catch (error) {
    logger.error('Failed to get advertising status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Variants endpoint
router.get('/variants', requireAuth, async (req, res) => {
  try {
    res.json({ variants: [] });
  } catch (error) {
    logger.error('Failed to get variants:', error);
    res.status(500).json({ error: 'Failed to get variants' });
  }
});

// Attribution endpoints
router.get('/attribution/channels', requireAuth, async (req, res) => {
  try {
    res.json({ channels: [] });
  } catch (error) {
    logger.error('Failed to get attribution channels:', error);
    res.status(500).json({ error: 'Failed to get attribution channels' });
  }
});

router.get('/attribution/paths', requireAuth, async (req, res) => {
  try {
    res.json({ paths: [] });
  } catch (error) {
    logger.error('Failed to get attribution paths:', error);
    res.status(500).json({ error: 'Failed to get attribution paths' });
  }
});

// Dashboard endpoints
router.get('/dashboard/attribution', requireAuth, async (req, res) => {
  try {
    res.json({ attribution: { channels: [], total: 0 } });
  } catch (error) {
    logger.error('Failed to get dashboard attribution:', error);
    res.status(500).json({ error: 'Failed to get dashboard attribution' });
  }
});

router.get('/dashboard/paths', requireAuth, async (req, res) => {
  try {
    res.json({ paths: [] });
  } catch (error) {
    logger.error('Failed to get dashboard paths:', error);
    res.status(500).json({ error: 'Failed to get dashboard paths' });
  }
});

// ROAS endpoints
router.get('/roas/audience-segments', requireAuth, async (req, res) => {
  try {
    res.json({ segments: [] });
  } catch (error) {
    logger.error('Failed to get ROAS audience segments:', error);
    res.status(500).json({ error: 'Failed to get ROAS audience segments' });
  }
});

router.get('/roas/campaigns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.userId, userId))
      .orderBy(desc(adCampaigns.createdAt));
    res.json({ campaigns });
  } catch (error) {
    logger.error('Failed to get ROAS campaigns:', error);
    res.status(500).json({ error: 'Failed to get ROAS campaigns' });
  }
});

router.get('/roas/creative-fatigue-analysis', requireAuth, async (req, res) => {
  try {
    res.json({ analysis: { fatigued: [], healthy: [] } });
  } catch (error) {
    logger.error('Failed to get ROAS creative fatigue analysis:', error);
    res.status(500).json({ error: 'Failed to get ROAS creative fatigue analysis' });
  }
});

router.get('/roas/forecast', requireAuth, async (req, res) => {
  try {
    res.json({ forecast: { daily: [], weekly: [], monthly: [] } });
  } catch (error) {
    logger.error('Failed to get ROAS forecast:', error);
    res.status(500).json({ error: 'Failed to get ROAS forecast' });
  }
});

// AI-powered campaign optimization
router.post('/optimize-campaign', requireAuth, async (req, res) => {
  try {
    const { campaignId, performance } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Build campaign object for AI optimization
    const campaign = {
      id: campaignId,
      name: performance?.name || 'Campaign',
      platform: performance?.platform || 'instagram',
      objective: performance?.objective || 'engagement',
      status: 'active' as const,
      budget: performance?.budget || 500,
      dailyBudget: performance?.dailyBudget || 50,
      startDate: new Date(),
      targeting: {
        ageMin: 18,
        ageMax: 44,
        genders: ['male', 'female'] as ('male' | 'female')[],
        locations: ['US'],
        interests: ['music'],
        behaviors: [],
        customAudiences: [],
        lookalikes: [],
        excludedAudiences: [],
      },
      creatives: [{
        id: 'c1',
        type: 'image' as const,
        headline: 'Check it out',
        body: 'New content',
        callToAction: 'Learn More',
      }],
      metrics: {
        impressions: performance?.impressions || 1000,
        clicks: performance?.clicks || 50,
        conversions: performance?.conversions || 5,
        spend: performance?.spend || 100,
        revenue: performance?.revenue || 150,
        ctr: performance?.ctr || 0.05,
        cvr: performance?.cvr || 0.1,
        cpc: performance?.cpc || 2,
        cpa: performance?.cpa || 20,
        roas: performance?.roas || 1.5,
      },
    };

    const result = await unifiedAIController.optimizeAd({
      campaign,
      action: 'score',
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      campaignId,
      optimization: result.data,
      recommendations: result.data?.recommendations || [],
    });

    const userId = (req as AuthenticatedRequest).user?.id;
    if (userId) {
      setImmediate(async () => {
        try {
          const campaignName = performance?.name || `Campaign ${campaignId}`;
          const topRec = (result.data?.recommendations as string[] | undefined)?.[0] || 'Review your targeting and creatives for better performance.';
          await notificationService.sendAdCampaignOptimizedNotification(userId, campaignName, topRec);
        } catch (err) {
          logger.error('Ad campaign optimized notification error:', err);
        }
      });
    }
  } catch (error) {
    logger.error('Failed to optimize campaign:', error);
    res.status(500).json({ error: 'Failed to optimize campaign' });
  }
});

// AI-powered content generation for ads
router.post('/generate-content', requireAuth, async (req, res) => {
  try {
    const { 
      campaignId, 
      contentType = 'promotional', 
      platform = 'instagram',
      topic = 'new music release',
      tone = 'energetic'
    } = req.body;

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional'];

    const result = await unifiedAIController.generateContent({
      tone: validTones.includes(tone) ? tone : 'energetic',
      platform: validPlatforms.includes(platform) ? platform : 'instagram',
      topic: topic || 'new music',
      contentType: contentType === 'ad_copy' ? 'promotional' : contentType,
      includeHashtags: true,
      includeEmojis: true,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      campaignId,
      content: result.data,
    });
  } catch (error) {
    logger.error('Failed to generate ad content:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

router.post('/generate-video', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      topic, platform, template, aspect_ratio, duration,
      tone, goal, artist_name, quality,
    } = req.body;

    const result = await pythonAIService.generateVideo({
      topic,
      platform: platform || 'instagram',
      template: template || 'cinematic_promo',
      aspect_ratio,
      duration: duration || 10,
      tone: tone || 'energetic',
      goal: goal || 'growth',
      artist_name,
      quality: quality || 'cinematic',
    });

    if (!result.success || !result.data?.success) {
      return res.status(500).json({
        success: false,
        message: result.data?.error || result.error || 'Video generation failed',
      });
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Failed to generate ad video:', error);
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.post('/generate-image', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { topic, platform, tone, goal, artist_name, style } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, message: 'Topic is required' });
    }

    const result = await pythonAIService.generateImage({
      topic,
      platform: platform || 'instagram',
      tone: tone || 'energetic',
      goal: goal || 'growth',
      artist_name,
      style: style || 'modern',
    });

    if (!result.success) {
      const specResult = await pythonAIService.generateVisualSpec({
        topic,
        platform: platform || 'instagram',
        tone: tone || 'energetic',
        goal: goal || 'growth',
        artist_name,
        style: style || 'modern',
      });

      if (!specResult.success) {
        return res.status(500).json({
          success: false,
          message: specResult.error || 'Image generation failed',
        });
      }

      return res.json({ success: true, visual_spec: specResult.data, image_url: null });
    }

    res.json({ success: true, ...result.data });
  } catch (error) {
    logger.error('Failed to generate ad image:', error);
    res.status(500).json({ success: false, message: 'Image generation failed' });
  }
});

router.get('/video-templates', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pythonAIService.getCinematicTemplates();
    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.json({
        templates: [
          { id: 'cinematic_promo', name: 'Cinematic Promo', description: 'Film-quality promotional video', category: 'promo' },
          { id: 'neon_pulse', name: 'Neon Pulse', description: 'Vibrant neon with plasma backgrounds', category: 'energetic' },
          { id: 'dark_cinema', name: 'Dark Cinema', description: 'Moody atmospheric film look', category: 'dramatic' },
          { id: 'music_video', name: 'Music Video', description: 'High-energy music video style', category: 'music' },
          { id: 'gold_luxury', name: 'Gold Luxury', description: 'Premium gold and black aesthetic', category: 'luxury' },
          { id: 'elegant_minimal', name: 'Elegant Minimal', description: 'Clean sophisticated design', category: 'professional' },
        ],
      });
    }
  } catch (error) {
    logger.error('Failed to get ad video templates:', error);
    res.status(500).json({ success: false, message: 'Failed to get templates' });
  }
});

export default router;
