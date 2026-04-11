import { Router, Request, Response } from 'express';
import { requireAuth, requireAuthOnly } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { unifiedAIController } from '../services/unifiedAIController.js';
import { storage } from '../storage.js';
import { notificationService } from '../services/notificationService.js';
import { pythonAIService } from '../services/pythonAIService.js';
import { renderVideo as renderAdvancedVideo } from '../services/advancedVideoRendererService.js';
import { db } from '../db.js';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import { adCampaigns, adCreatives } from '@shared/schema';

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
    logger.warn({ err: error }, 'Failed to get campaigns:');
    res.status(500).json({ error: 'Failed to get campaigns' });
  }
});

router.get('/ai-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getAdvertisingInsights(userId);
    res.json(insights);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get AI insights:');
    res.status(500).json({ error: 'Failed to get AI insights' });
  }
});

router.get('/audience-segments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const segments = await storage.getAudienceSegments(userId);
    res.json({ segments });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get audience segments:');
    res.status(500).json({ error: 'Failed to get audience segments' });
  }
});

router.get('/creative-fatigue', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const creatives = await storage.getCreativeFatigue(userId);
    res.json({ creatives });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get creative fatigue:');
    res.status(500).json({ error: 'Failed to get creative fatigue' });
  }
});

router.get('/bidding-strategies', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const strategies = await storage.getBiddingStrategies(userId);
    res.json({ strategies });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get bidding strategies:');
    res.status(500).json({ error: 'Failed to get bidding strategies' });
  }
});

router.get('/lookalike-audiences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const audiences = await storage.getLookalikeAudiences(userId);
    res.json({ audiences });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get lookalike audiences:');
    res.status(500).json({ error: 'Failed to get lookalike audiences' });
  }
});

router.get('/forecasts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const forecasts = await storage.getAdvertisingForecasts(userId);
    res.json({ forecasts: forecasts ? [forecasts] : [] });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get forecasts:');
    res.status(500).json({ error: 'Failed to get forecasts' });
  }
});

router.get('/competitor-insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getCompetitorInsights(userId);
    res.json({ insights });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get competitor insights:');
    res.status(500).json({ error: 'Failed to get competitor insights' });
  }
});

router.get('/ab-tests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const creatives = await db
      .select()
      .from(adCreatives)
      .where(and(eq(adCreatives.userId, userId), isNotNull(adCreatives.variants)))
      .orderBy(desc(adCreatives.createdAt))
      .limit(50);

    const tests = creatives
      .filter(c => c.variants && Array.isArray(c.variants) && (c.variants as any[]).length > 1)
      .map(c => ({
        id: c.id,
        name: c.name,
        status: c.status || 'draft',
        campaignId: c.campaignId,
        variants: c.variants,
        performance: c.performance || null,
        createdAt: c.createdAt,
      }));

    res.json({ tests });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get A/B tests:');
    res.status(500).json({ error: 'Failed to get A/B tests' });
  }
});

router.post('/campaigns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, platform: platformDirect, objective, startDate, endDate, targetAudience, creativeIds } = req.body;
    const platform = platformDirect ||
      (Array.isArray(targetAudience?.platforms) && targetAudience.platforms.length > 0
        ? targetAudience.platforms[0]
        : null);

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Campaign name is required' });
    }
    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({ error: 'Platform is required — select at least one platform in the targeting section' });
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
        logger.warn({ err: err }, 'Ad campaign created notification error:');
      }
    });

    res.status(201).json({ success: true, campaign });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create campaign:');
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.post('/upload-image', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'Image upload for ad creatives requires file storage. Use the Files section to upload media, then reference the URL in your creative.' });
});

// Advertising autopilot status — returns isRunning, config, modelStatus + campaign metrics
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [campaigns, autopilotConfig] = await Promise.all([
      db.select({ platform: adCampaigns.platform, status: adCampaigns.status, budget: adCampaigns.budget })
        .from(adCampaigns)
        .where(eq(adCampaigns.userId, userId))
        .limit(100),
      storage.getAdvertisingAutopilotConfig(userId),
    ]);

    const activeCampaigns = campaigns.filter(c => c.status === 'active');
    const connectedPlatforms = [...new Set(activeCampaigns.map(c => c.platform))];
    const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);

    res.json({
      isRunning: autopilotConfig?.isRunning || false,
      config: autopilotConfig || null,
      status: {
        campaignStatus: activeCampaigns.length > 0 ? 'active' : 'inactive',
        connectedPlatforms,
        budget: totalBudget,
        spent: 0,
        activeCampaigns: activeCampaigns.length,
      },
      modelStatus: {
        advertising: { trained: false, version: '1.0.0' },
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get advertising status:');
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Start advertising autopilot
router.post('/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    let config = await storage.getAdvertisingAutopilotConfig(userId);
    config = { ...(config || {}), isRunning: true, enabled: true };
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    logger.info(`✅ Advertising autopilot started for user ${userId}`);
    res.json({ success: true, message: 'Advertising autopilot activated', config });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to start advertising autopilot:');
    res.status(500).json({ error: 'Failed to start advertising autopilot' });
  }
});

// Stop advertising autopilot
router.post('/stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    let config = await storage.getAdvertisingAutopilotConfig(userId);
    config = { ...(config || {}), isRunning: false, enabled: false };
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    logger.info(`⏸️ Advertising autopilot paused for user ${userId}`);
    res.json({ success: true, message: 'Advertising autopilot paused' });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to stop advertising autopilot:');
    res.status(500).json({ error: 'Failed to stop advertising autopilot' });
  }
});

// Configure advertising autopilot
router.post('/configure', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const existing = await storage.getAdvertisingAutopilotConfig(userId);
    const config = { ...(existing || {}), ...req.body };
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    logger.info(`⚙️ Advertising autopilot configured for user ${userId}`);
    res.json({ success: true, message: 'Advertising autopilot configuration updated', config });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to configure advertising autopilot:');
    res.status(500).json({ error: 'Failed to configure advertising autopilot' });
  }
});

// Variants endpoint
router.get('/variants', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const creatives = await db
      .select()
      .from(adCreatives)
      .where(eq(adCreatives.userId, userId))
      .orderBy(desc(adCreatives.createdAt))
      .limit(100);

    const variants = creatives.flatMap(c => {
      if (!c.variants || !Array.isArray(c.variants)) return [];
      return (c.variants as any[]).map((v: any, idx: number) => ({
        id: `${c.id}-v${idx}`,
        creativeId: c.id,
        creativeName: c.name,
        variantIndex: idx,
        ...v,
      }));
    });

    res.json({ variants });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get variants:');
    res.status(500).json({ error: 'Failed to get variants' });
  }
});

// Attribution endpoints — derive from campaign data
router.get('/attribution/channels', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({ platform: adCampaigns.platform, budget: adCampaigns.budget, status: adCampaigns.status, performance: adCampaigns.performance })
      .from(adCampaigns)
      .where(eq(adCampaigns.userId, userId))
      .limit(200);

    const channelMap = new Map<string, { spend: number; conversions: number; revenue: number; campaigns: number }>();
    for (const c of campaigns) {
      const perf = (c.performance || {}) as any;
      const entry = channelMap.get(c.platform) || { spend: 0, conversions: 0, revenue: 0, campaigns: 0 };
      entry.spend += Number(c.budget || 0);
      entry.conversions += Number(perf.conversions || 0);
      entry.revenue += Number(perf.revenue || 0);
      entry.campaigns += 1;
      channelMap.set(c.platform, entry);
    }

    const channels = Array.from(channelMap.entries()).map(([platform, data]) => ({
      platform,
      spend: data.spend,
      conversions: data.conversions,
      revenue: data.revenue,
      roas: data.spend > 0 ? data.revenue / data.spend : 0,
      campaigns: data.campaigns,
    }));

    res.json({ channels });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get attribution channels:');
    res.status(500).json({ error: 'Failed to get attribution channels' });
  }
});

router.get('/attribution/paths', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({ platform: adCampaigns.platform, objective: adCampaigns.objective, performance: adCampaigns.performance })
      .from(adCampaigns)
      .where(and(eq(adCampaigns.userId, userId), isNotNull(adCampaigns.performance)))
      .limit(100);

    const paths = campaigns
      .filter(c => (c.performance as any)?.conversions > 0)
      .map(c => ({
        path: [c.platform, c.objective || 'conversion'].filter(Boolean),
        conversions: (c.performance as any)?.conversions || 0,
        revenue: (c.performance as any)?.revenue || 0,
      }));

    res.json({ paths });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get attribution paths:');
    res.status(500).json({ error: 'Failed to get attribution paths' });
  }
});

// Dashboard endpoints
router.get('/dashboard/attribution', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({ platform: adCampaigns.platform, budget: adCampaigns.budget, performance: adCampaigns.performance })
      .from(adCampaigns)
      .where(eq(adCampaigns.userId, userId))
      .limit(200);

    const channelMap = new Map<string, number>();
    let total = 0;
    for (const c of campaigns) {
      const rev = Number((c.performance as any)?.revenue || c.budget || 0);
      channelMap.set(c.platform, (channelMap.get(c.platform) || 0) + rev);
      total += rev;
    }

    const channels = Array.from(channelMap.entries()).map(([platform, revenue]) => ({
      platform,
      revenue,
      share: total > 0 ? revenue / total : 0,
    }));

    res.json({ attribution: { channels, total } });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get dashboard attribution:');
    res.status(500).json({ error: 'Failed to get dashboard attribution' });
  }
});

router.get('/dashboard/paths', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({ platform: adCampaigns.platform, objective: adCampaigns.objective, performance: adCampaigns.performance, status: adCampaigns.status })
      .from(adCampaigns)
      .where(eq(adCampaigns.userId, userId))
      .limit(100);

    const paths = campaigns
      .filter(c => c.status === 'active' || c.status === 'completed')
      .map(c => ({
        channel: c.platform,
        objective: c.objective,
        conversions: (c.performance as any)?.conversions || 0,
      }));

    res.json({ paths });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get dashboard paths:');
    res.status(500).json({ error: 'Failed to get dashboard paths' });
  }
});

// ROAS endpoints
router.get('/roas/audience-segments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({ id: adCampaigns.id, name: adCampaigns.name, targetAudience: adCampaigns.targetAudience, budget: adCampaigns.budget, performance: adCampaigns.performance })
      .from(adCampaigns)
      .where(and(eq(adCampaigns.userId, userId), isNotNull(adCampaigns.targetAudience)))
      .limit(50);

    const segments = campaigns.map(c => ({
      campaignId: c.id,
      campaignName: c.name,
      audience: c.targetAudience,
      spend: Number(c.budget || 0),
      roas: (() => {
        const perf = c.performance as any;
        const revenue = Number(perf?.revenue || 0);
        const spend = Number(c.budget || 0);
        return spend > 0 ? revenue / spend : 0;
      })(),
    }));

    res.json({ segments });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS audience segments:');
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
      .orderBy(desc(adCampaigns.createdAt))
      .limit(100);
    res.json({ campaigns });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS campaigns:');
    res.status(500).json({ error: 'Failed to get ROAS campaigns' });
  }
});

router.get('/roas/creative-fatigue-analysis', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const creatives = await db
      .select()
      .from(adCreatives)
      .where(eq(adCreatives.userId, userId))
      .orderBy(desc(adCreatives.createdAt))
      .limit(100);

    const fatigued: any[] = [];
    const healthy: any[] = [];

    for (const c of creatives) {
      const perf = (c.performance || {}) as any;
      const ctr = Number(perf.ctr || 0);
      const impressions = Number(perf.impressions || 0);
      const age = c.createdAt ? Math.floor((Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

      const isFatigued = (impressions > 10000 && ctr < 0.5) || age > 60;

      const item = {
        id: c.id,
        name: c.name,
        type: c.type,
        campaignId: c.campaignId,
        ctr,
        impressions,
        ageInDays: age,
        status: c.status,
        fatigueScore: isFatigued ? Math.min(100, age + (impressions > 10000 ? 30 : 0)) : Math.max(0, age / 2),
      };

      if (isFatigued) {
        fatigued.push(item);
      } else {
        healthy.push(item);
      }
    }

    res.json({ analysis: { fatigued, healthy } });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS creative fatigue analysis:');
    res.status(500).json({ error: 'Failed to get ROAS creative fatigue analysis' });
  }
});

router.get('/roas/forecast', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await db
      .select({ budget: adCampaigns.budget, dailyBudget: adCampaigns.dailyBudget, performance: adCampaigns.performance, status: adCampaigns.status })
      .from(adCampaigns)
      .where(and(eq(adCampaigns.userId, userId), eq(adCampaigns.status, 'active')))
      .limit(100);

    const totalDailyBudget = campaigns.reduce((sum, c) => sum + Number(c.dailyBudget || c.budget / 30 || 0), 0);
    const avgRoas = (() => {
      const withPerf = campaigns.filter(c => (c.performance as any)?.roas);
      if (!withPerf.length) return 2.5;
      return withPerf.reduce((sum, c) => sum + Number((c.performance as any).roas || 0), 0) / withPerf.length;
    })();

    const daily = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i + 1);
      const jitter = 0.85 + Math.random() * 0.3;
      const spend = totalDailyBudget * jitter;
      return { date: date.toISOString().split('T')[0], spend, revenue: spend * avgRoas, roas: avgRoas * jitter };
    });

    const weekly = Array.from({ length: 4 }, (_, i) => {
      const spend = totalDailyBudget * 7 * (0.9 + i * 0.05);
      return { week: i + 1, spend, revenue: spend * avgRoas, roas: avgRoas };
    });

    const monthly = Array.from({ length: 3 }, (_, i) => {
      const spend = totalDailyBudget * 30 * (0.95 + i * 0.03);
      return { month: i + 1, spend, revenue: spend * avgRoas, roas: avgRoas };
    });

    res.json({ forecast: { daily, weekly, monthly, activeCampaigns: campaigns.length, dailyBudget: totalDailyBudget } });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS forecast:');
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
          logger.warn({ err: err }, 'Ad campaign optimized notification error:');
        }
      });
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to optimize campaign:');
    res.status(500).json({ error: 'Failed to optimize campaign' });
  }
});

// AI-powered content generation for ads
router.post('/generate-content', requireAuthOnly, async (req, res) => {
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
    logger.warn({ err: error }, 'Failed to generate ad content:');
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

router.post('/generate-video', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      topic, platform, template, aspect_ratio, duration,
      tone, goal, artist_name, quality,
    } = req.body;

    // Route through the Advanced Video Renderer (MaxCore → Python AI → FFmpeg)
    const result = await renderAdvancedVideo({
      topic: topic || 'music promotion',
      platform: platform || 'instagram',
      template: template || 'cinematic_promo',
      aspect_ratio,
      duration: duration || 10,
      tone: tone || 'energetic',
      goal: goal || 'growth',
      artist_name,
      quality: quality || 'cinematic',
    });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error || 'Video generation failed' });
    }

    logger.info(`[AdVideoGen] Video ready via ${result.source || 'renderer'}`);
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate ad video:');
    res.status(500).json({ success: false, message: 'Video generation failed' });
  }
});

router.post('/generate-image', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
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
    logger.warn({ err: error }, 'Failed to generate ad image:');
    res.status(500).json({ success: false, message: 'Image generation failed' });
  }
});

router.get('/video-templates', requireAuthOnly, async (_req: AuthenticatedRequest, res: Response) => {
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
    logger.warn({ err: error }, 'Failed to get ad video templates:');
    res.status(500).json({ success: false, message: 'Failed to get templates' });
  }
});

export default router;
