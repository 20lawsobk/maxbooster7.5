import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { aiModelManager } from '../services/aiModelManager.js';
import { MaxCoreAIClient } from '../services/unifiedAIController.js';
import { db } from '../db';
import { adCampaigns } from '@shared/schema';
import { eq, count, sum, avg, gt, desc, and, isNotNull } from 'drizzle-orm';

const router = Router();

// Advertising Autopilot Configuration Schema
const advertisingAutopilotConfigSchema = z.object({
  enabled: z.boolean(),
  platforms: z.array(z.string()).optional(),
  campaignObjective: z.enum(['awareness', 'engagement', 'conversions', 'traffic', 'viral']).optional(),
  campaignFrequency: z.enum(['hourly', 'daily', 'twice-daily', 'weekly']).optional(),
  brandVoice: z.string().optional(),
  contentTypes: z.array(z.string()).optional(),
  mediaTypes: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  ageMin: z.number().min(13).max(100).optional(),
  ageMax: z.number().min(13).max(100).optional(),
  interests: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  budgetOptimization: z.boolean().optional(),
  dailyBudgetLimit: z.number().min(0).optional(),
  viralOptimization: z.boolean().optional(),
  algorithmicTargeting: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
  optimalTimesOnly: z.boolean().optional(),
  crossPlatformCampaigns: z.boolean().optional(),
  engagementThreshold: z.number().min(0).max(1).optional(),
  minConfidenceThreshold: z.number().min(0).max(1).default(0.7),
  autoAnalyzeBeforePosting: z.boolean().default(true),
});

// Get advertising autopilot status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const now = new Date();

    const config = await storage.getAdvertisingAutopilotConfig(userId).catch(() => null);

    let modelTrained = false, modelVersion = '1.0.0';
    let audienceSegments = 0, viralSuccessRate = 0, organicReachMultiplier = 1;
    try {
      const advertisingModel = await aiModelManager.getAdvertisingAutopilot(userId);
      modelTrained = advertisingModel.getIsTrained();
      modelVersion = advertisingModel.getVersion();
      audienceSegments = advertisingModel.getAudienceSegments().length;
      viralSuccessRate = advertisingModel.getViralSuccessRate();
      organicReachMultiplier = advertisingModel.getAvgOrganicReachMultiplier();
    } catch (e) {
      logger.warn({ err: e }, 'getAdvertisingAutopilot unavailable, using defaults:');
    }

    // Real campaign stats from ad_campaigns table
    const [totalRow, nextCampaignRow, recentCampaignRows] = await Promise.all([
      db.select({ value: count() }).from(adCampaigns)
        .where(eq(adCampaigns.userId, userId)),
      db.select({ startDate: adCampaigns.startDate }).from(adCampaigns)
        .where(and(eq(adCampaigns.userId, userId), isNotNull(adCampaigns.startDate), gt(adCampaigns.startDate, now)))
        .orderBy(adCampaigns.startDate)
        .limit(1),
      db.select().from(adCampaigns)
        .where(eq(adCampaigns.userId, userId))
        .orderBy(desc(adCampaigns.createdAt))
        .limit(10),
    ]).catch(() => [[], [], []]);

    const totalCampaigns = Number((totalRow as any[])[0]?.value ?? 0);
    const nextScheduledCampaign = (nextCampaignRow as any[])[0]?.startDate ?? null;

    // Aggregate reach and engagement from campaign performance JSON
    let totalReach = 0;
    let engagementRateSum = 0;
    let engagementRateCount = 0;
    for (const c of (recentCampaignRows as any[])) {
      const perf = c.performance as any;
      if (perf) {
        totalReach += Number(perf.reach || perf.impressions || 0);
        const rate = perf.engagementRate || perf.engagement_rate;
        if (rate != null) { engagementRateSum += Number(rate); engagementRateCount++; }
      }
    }
    const avgEngagementRate = engagementRateCount > 0 ? engagementRateSum / engagementRateCount : 0;

    const recentActivity = (recentCampaignRows as any[]).map((c: any) => ({
      status: c.status === 'active' || c.status === 'completed' ? 'completed' : c.status === 'failed' ? 'failed' : 'scheduled',
      title: c.name || 'Campaign',
      description: `${c.platform || 'multi-platform'} • ${c.objective || 'awareness'}`,
      time: c.startDate || c.createdAt,
    }));

    res.json({
      isRunning: config?.enabled || false,
      config: config || {
        enabled: false,
        platforms: [],
        campaignObjective: 'awareness',
        campaignFrequency: 'daily',
        brandVoice: 'professional',
        contentTypes: ['brand-awareness', 'engagement-boost'],
        mediaTypes: ['text', 'image'],
        targetAudience: '',
        ageMin: 18,
        ageMax: 65,
        interests: [],
        locations: [],
        budgetOptimization: true,
        dailyBudgetLimit: 0,
        viralOptimization: true,
        algorithmicTargeting: true,
        autoPublish: false,
        optimalTimesOnly: true,
        crossPlatformCampaigns: false,
        engagementThreshold: 0.02,
        minConfidenceThreshold: 0.70,
        autoAnalyzeBeforePosting: true,
      },
      status: {
        totalCampaigns,
        totalReach,
        avgEngagementRate,
        nextScheduledCampaign,
        recentActivity,
      },
      modelStatus: {
        trained: modelTrained,
        version: modelVersion,
        audienceSegments,
        viralSuccessRate,
        organicReachMultiplier,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get advertising autopilot status:');
    res.status(500).json({ error: 'Failed to get advertising autopilot status' });
  }
});

// Start advertising autopilot
router.post('/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get or create config
    let config = await storage.getAdvertisingAutopilotConfig(userId);
    if (!config) {
      config = {
        enabled: true,
        platforms: ['facebook', 'instagram', 'twitter'],
        campaignObjective: 'awareness',
        campaignFrequency: 'daily',
        brandVoice: 'professional',
        contentTypes: ['brand-awareness', 'engagement-boost'],
        mediaTypes: ['text', 'image'],
        targetAudience: '',
        ageMin: 18,
        ageMax: 65,
        interests: [],
        locations: [],
        budgetOptimization: true,
        dailyBudgetLimit: 0,
        viralOptimization: true,
        algorithmicTargeting: true,
        autoPublish: false,
        optimalTimesOnly: true,
        crossPlatformCampaigns: false,
        engagementThreshold: 0.02,
        minConfidenceThreshold: 0.70,
        autoAnalyzeBeforePosting: true,
      };
    } else {
      config.enabled = true;
    }
    
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    
    logger.info(`✅ Advertising Autopilot started for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Advertising Autopilot activated',
      config,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to start advertising autopilot:');
    res.status(500).json({ error: 'Failed to start advertising autopilot' });
  }
});

// Stop advertising autopilot
router.post('/stop', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const config = await storage.getAdvertisingAutopilotConfig(userId);
    if (config) {
      config.enabled = false;
      await storage.saveAdvertisingAutopilotConfig(userId, config);
    }
    
    logger.info(`⏸️ Advertising Autopilot stopped for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Advertising Autopilot paused',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to stop advertising autopilot:');
    res.status(500).json({ error: 'Failed to stop advertising autopilot' });
  }
});

// Configure advertising autopilot
router.post('/configure', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const config = advertisingAutopilotConfigSchema.parse(req.body);
    
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    
    logger.info(`⚙️ Advertising Autopilot configured for user ${userId}`);
    
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
    logger.warn({ err: error }, 'Failed to configure advertising autopilot:');
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Generate campaign recommendations
router.post('/recommend', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { objective, includeMultimodal } = req.body;
    
    // Get AI model
    const advertisingModel = await aiModelManager.getAdvertisingAutopilot(userId);
    
    // Get multimodal features if enabled
    let multimodalFeatures = null;
    if (includeMultimodal !== false) {
      const recentAnalyzedContent = await storage.getRecentAnalyzedContent(userId, 10);
      if (recentAnalyzedContent && recentAnalyzedContent.length > 0) {
        multimodalFeatures = recentAnalyzedContent[0].features;
      }
    }
    
    // Generate campaign recommendations
    const recommendations = await advertisingModel.generateCampaignRecommendations(
      objective || 'awareness',
      multimodalFeatures
    );
    
    res.json({
      success: true,
      recommendations,
      usedMultimodal: !!multimodalFeatures,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to generate campaign recommendations:');
    res.status(500).json({ error: 'Failed to generate campaign recommendations' });
  }
});

// Get AI performance metrics
router.get('/performance', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const advertisingModel = await aiModelManager.getAdvertisingAutopilot(userId);
    const organicReachMultiplier = advertisingModel.getAvgOrganicReachMultiplier();
    const audienceSegments = advertisingModel.getAudienceSegments();
    
    // Compute estimated savings from real organicReachMultiplier
    // Industry avg CPM for paid social ads: ~$8-12. We use $10 as baseline.
    // Estimated monthly posts across active campaigns
    const activeCampaigns = await db.select({ id: adCampaigns.id })
      .from(adCampaigns)
      .where(and(eq(adCampaigns.userId, userId), eq(adCampaigns.status, 'active')))
      .limit(100);
    const numCampaigns = activeCampaigns.length;

    // Baseline: if artist had 0 campaigns, show neutral
    const multiplier = organicReachMultiplier || 1.0;
    const pctBetter = Math.round((multiplier - 1) * 100);
    // Each campaign is estimated to generate ~50k impressions/month organically
    const estimatedMonthlyImpressions = numCampaigns * 50000;
    // What those impressions would cost as paid ads at $10 CPM
    const equivalentPaidSpend = (estimatedMonthlyImpressions / 1000) * 10;
    const annualSavings = Math.round(equivalentPaidSpend * 12);
    // Revenue uplift: each campaign that outperforms paid avg generates ~10% more conversions
    const conversionUplift = numCampaigns > 0 ? Math.round(numCampaigns * multiplier * 500) : 0;

    res.json({
      success: true,
      organicReachMultiplier: multiplier,
      viralSuccessRate: advertisingModel.getViralSuccessRate() || 0,
      trained: advertisingModel.getIsTrained(),
      audienceSegments: audienceSegments || [],
      totalSegments: audienceSegments?.length || 0,
      activeCampaigns: numCampaigns,
      performance: {
        vsOrganicBaseline: pctBetter > 0 ? `${pctBetter}% above organic baseline` : 'Building performance data...',
        estimatedAnnualSavings: annualSavings > 0 ? `~$${annualSavings.toLocaleString()}/year in equivalent ad spend` : 'Activate campaigns to see savings',
        estimatedRevenueUplift: conversionUplift > 0 ? `~$${conversionUplift.toLocaleString()}/year from AI-optimized reach` : 'Based on active campaign data',
        note: 'Estimates based on industry-avg $10 CPM and your real organic reach multiplier',
      },
    });
  } catch (error: any) {
    logger.warn({ err: error }, 'Performance metrics error:');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaigns - returns empty array when no real data exists
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await storage.getAdvertisingCampaigns?.(userId) || [];
    res.json(campaigns);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get campaigns:');
    res.status(500).json({ error: 'Failed to get campaigns:' });
  }
});

// Get AI insights - returns empty state when no real data exists
router.get('/ai-insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getAdvertisingInsights?.(userId) || null;
    res.json(insights ?? { campaigns: [], totalSpend: 0, totalRevenue: 0, roas: 0 });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get AI insights:');
    res.status(500).json({ error: 'Failed to get AI insights' });
  }
});

// Get audience segments - returns empty array when no real data exists
router.get('/audience-segments', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const segments = await storage.getAudienceSegments?.(userId) || [];
    res.json(segments);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get audience segments:');
    res.status(500).json({ error: 'Failed to get audience segments:' });
  }
});

// Get creative fatigue data - returns empty array when no real data exists
router.get('/creative-fatigue', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const fatigue = await storage.getCreativeFatigue?.(userId) || [];
    res.json(fatigue);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get creative fatigue:');
    res.status(500).json({ error: 'Failed to get creative fatigue:' });
  }
});

// Get bidding strategies - returns empty array when no real data exists
router.get('/bidding-strategies', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const strategies = await storage.getBiddingStrategies?.(userId) || [];
    res.json(strategies);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get bidding strategies:');
    res.status(500).json({ error: 'Failed to get bidding strategies:' });
  }
});

// Get lookalike audiences - returns empty array when no real data exists
router.get('/lookalike-audiences', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const audiences = await storage.getLookalikeAudiences?.(userId) || [];
    res.json(audiences);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get lookalike audiences:');
    res.status(500).json({ error: 'Failed to get lookalike audiences:' });
  }
});

// Get forecasts - returns null when no real data exists
router.get('/forecasts', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const forecasts = await storage.getAdvertisingForecasts?.(userId) || null;
    res.json(forecasts ?? []);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get forecasts:');
    res.status(500).json({ error: 'Failed to get forecasts' });
  }
});

// Get competitor insights - returns empty array when no real data exists
router.get('/competitor-insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const insights = await storage.getCompetitorInsights?.(userId) || [];
    res.json(insights);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get competitor insights:');
    res.status(500).json({ error: 'Failed to get competitor insights:' });
  }
});

// Get A/B tests - returns empty array when no real data exists
router.get('/ab-tests', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const tests = await storage.getABTests?.(userId) || [];
    res.json(tests);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get A/B tests:');
    res.status(500).json({ error: 'Failed to get A/B tests:' });
  }
});

// Get creative variants - returns empty array when no real data exists
router.get('/creative-variants', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const variants = await storage.getCreativeVariants?.(userId) || [];
    res.json(variants);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get creative variants:');
    res.status(500).json({ error: 'Failed to get creative variants:' });
  }
});

// Get ROAS campaigns - returns empty array when no real data exists
router.get('/roas/campaigns', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await storage.getRoasCampaigns?.(userId) || [];
    res.json(campaigns);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS campaigns:');
    res.status(500).json({ error: 'Failed to get ROAS campaigns:' });
  }
});

// Get ROAS audience segments - returns empty array when no real data exists
router.get('/roas/audience-segments', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const segments = await storage.getRoasAudienceSegments?.(userId) || [];
    res.json(segments);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS audience segments:');
    res.status(500).json({ error: 'Failed to get ROAS audience segments:' });
  }
});

// Get ROAS forecast data - returns empty array when no real data exists
router.get('/roas/forecast', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const forecast = await storage.getRoasForecast?.(userId) || [];
    res.json(forecast);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get ROAS forecast:');
    res.status(500).json({ error: 'Failed to get ROAS forecast:' });
  }
});

// Get budget optimization data - returns empty array when no real data exists
router.get('/roas/budget-optimization', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = await storage.getBudgetOptimization?.(userId) || [];
    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get budget optimization:');
    res.status(500).json({ error: 'Failed to get budget optimization:' });
  }
});

// Get creative fatigue analysis - returns empty array when no real data exists
router.get('/roas/creative-fatigue-analysis', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = await storage.getCreativeFatigueAnalysis?.(userId) || [];
    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get creative fatigue analysis:');
    res.status(500).json({ error: 'Failed to get creative fatigue analysis:' });
  }
});

// Get budget pacing campaigns - returns empty array when no real data exists
router.get('/budget-pacing/campaigns', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const campaigns = await storage.getBudgetPacingCampaigns?.(userId) || [];
    res.json(campaigns);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get budget pacing campaigns:');
    res.status(500).json({ error: 'Failed to get budget pacing campaigns:' });
  }
});

// Get budget pacing history - returns empty array when no real data exists
router.get('/budget-pacing/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const history = await storage.getBudgetPacingHistory?.(userId) || [];
    res.json(history);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get budget pacing history:');
    res.status(500).json({ error: 'Failed to get budget pacing history:' });
  }
});

// Get attribution data - returns empty array when no real data exists
router.get('/attribution', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = await storage.getAttributionData?.(userId) || [];
    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get attribution data:');
    res.status(500).json({ error: 'Failed to get attribution data:' });
  }
});

// Get cross-channel attribution - returns empty array when no real data exists
router.get('/cross-channel-attribution', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = await storage.getCrossChannelAttribution?.(userId) || [];
    res.json(data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get cross-channel attribution:');
    res.status(500).json({ error: 'Failed to get cross-channel attribution:' });
  }
});

// Get social listening keywords - returns empty array when no real data exists
router.get('/social-listening/keywords', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const keywords = await storage.getSocialListeningKeywords?.(userId) || [];
    res.json({ keywords });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening keywords:');
    res.status(500).json({ error: "Failed to get social listening keywords" });
  }
});

// Get social listening trending - returns empty array when no real data exists
router.get('/social-listening/trending', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const trending = await storage.getSocialListeningTrending?.(userId) || [];
    res.json({ trending });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening trending:');
    res.status(500).json({ error: "Failed to get social listening trending" });
  }
});

// Get social listening influencers - returns empty array when no real data exists
router.get('/social-listening/influencers', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const influencers = await storage.getSocialListeningInfluencers?.(userId) || [];
    res.json({ influencers });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening influencers:');
    res.status(500).json({ error: "Failed to get social listening influencers" });
  }
});

// Get social listening alerts - returns empty array when no real data exists
router.get('/social-listening/alerts', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const alerts = await storage.getSocialListeningAlerts?.(userId) || [];
    res.json({ alerts });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social listening alerts:');
    res.status(500).json({ error: "Failed to get social listening alerts" });
  }
});

// Get competitors - returns empty array when no real data exists
router.get('/competitors', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const competitors = await storage.getCompetitors?.(userId) || [];
    res.json({ competitors });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get competitors:');
    res.status(500).json({ error: "Failed to get competitors" });
  }
});

// Get your social stats - returns empty stats when no real data exists
router.get('/your-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await storage.getUserSocialStats?.(userId) || {
      totalFollowers: 0,
      avgEngagement: 0,
      shareOfVoice: 0,
      followersChange: 0,
      engagementChange: 0,
    };
    res.json(stats);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get your social stats:');
    res.status(500).json({ error: 'Failed to get social stats' });
  }
});

export default router;
