// @ts-nocheck
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { autopilotLearningService } from "../services/autopilotLearningService.js";
import { maxCoreControlTransport } from "../services/maxcoreControlTransport.js";
import { logger } from "../logger.js";
import { getRedisClient } from "../lib/redisConnectionFactory.js";

async function getPdimArtistLearningData(artistId: string) {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;
    const [patternRaw, peaksRaw, runsRaw, statsRaw] = await Promise.all([
      (redis as any)?.get(`mb:ads:${artistId}:patterns`).catch(() => null),
      (redis as any)?.lrange(`mb:ads:${artistId}:peaks`, 0, -1).catch(() => []),
      (redis as any)?.lrange(`mb:ads:${artistId}:runs`, 0, -1).catch(() => []),
      (redis as any)?.hgetall(`mb:ads:${artistId}:stats`).catch(() => null),
    ]);
    return {
      patterns: patternRaw ? JSON.parse(patternRaw) : null,
      peaks: (peaksRaw || [])
        .map((r: string) => {
          try {
            return JSON.parse(r);
          } catch {
            return null;
          }
        })
        .filter(Boolean),
      runs: (runsRaw || [])
        .map((r: string) => {
          try {
            return JSON.parse(r);
          } catch {
            return null;
          }
        })
        .filter(Boolean),
      stats: statsRaw || null,
    };
  } catch (e) {
    logger.warn(
      `[AutopilotLearning] PDIM artist data fetch failed: ${(e as any)?.message}`,
    );
    return null;
  }
}

const router = Router();

async function getSocialModelState() {
  const state = await maxCoreControlTransport.request<{
    domain?: string;
    version?: string;
    session_count?: number;
    weights?: { ready?: boolean };
  }>("/api/models/social/state", {
    method: "GET",
    authScope: "admin",
  });
  if (
    state.domain !== "social" ||
    typeof state.version !== "string" ||
    typeof state.session_count !== "number" ||
    typeof state.weights?.ready !== "boolean"
  ) {
    throw new Error("MaxCore social model state returned an invalid response");
  }
  return {
    domain: state.domain,
    version: state.version,
    sessionCount: state.session_count,
    ready: state.weights.ready,
  };
}

router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const modelState = await getSocialModelState();

    const [insights, recommendations, performance, platformStats, pdimData] =
      await Promise.all([
        autopilotLearningService?.getLearningInsights(userId),
        autopilotLearningService?.getRecommendations(userId),
        autopilotLearningService?.getPerformanceHistory(userId, { limit: 1 }),
        autopilotLearningService?.getPlatformStatistics(userId),
        getPdimArtistLearningData(userId),
      ]);

    res.json({
      success: true,
      learning: {
        isActive: modelState.ready,
        totalDataPoints: performance.total,
        patternsDetected: null,
        microPatternsFound: null,
        learningMultiplier: null,
        lastLearningCycle: null,
        processingTimeMs: null,
        humanEquivalentHours: null,
        modelVersion: modelState.version,
        modelSessionCount: modelState.sessionCount,
      },
      insights: {
        total: insights.length,
        types: insights.reduce((acc: Record<string, number>, i) => {
          acc[i.type] = (acc[i?.type] || 0) + 1;
          return acc;
        }, {}),
      },
      recommendations: {
        total: recommendations.length,
        actionable: recommendations.filter((r) => r?.actionable).length,
      },
      performance: {
        totalRecorded: performance.total,
        platformsCovered: platformStats.length,
        platforms: platformStats.map((p) => ({
          platform: p.platform,
          postCount: p.postCount,
          avgEngagement: p.avgEngagement,
        })),
      },
      adLearning: pdimData
        ? {
            source: "pdim",
            platformsLearned: Object.keys(pdimData?.patterns || {}),
            peakWindows: pdimData.peaks.length,
            runsRecorded: pdimData.runs.length,
            topCtas: Object.values(pdimData?.patterns || {})
              .flatMap((p: Record<string, unknown>) => p?.top_ctas || [])
              .slice(0, 5),
            topHooks: Object.values(pdimData?.patterns || {})
              .flatMap((p: Record<string, unknown>) => p?.top_hooks || [])
              .slice(0, 5),
            avgRoas: Object.values(pdimData?.patterns || {})
              .map((p: Record<string, unknown>) => p?.avg_roas)
              .filter(Boolean),
            stats: pdimData.stats,
          }
        : null,
      capabilities: [
        "performance_tracking",
        "content_recommendations",
        "maxcore_social_model",
        "pdim_ad_pattern_learning",
      ],
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get autopilot learning status:");
    res.status(500).json({ error: "Failed to get autopilot learning status" });
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
  metadata: z.record(z.string(), z.any()).optional(),
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

router.get("/insights", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const insights = await autopilotLearningService?.getLearningInsights(userId);

    res.json({
      success: true,
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get learning insights:");
    res.status(500).json({ error: "Failed to get learning insights" });
  }
});

router.get("/recommendations", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const recommendations =
      await autopilotLearningService?.getRecommendations(userId);

    res.json({
      success: true,
      recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get recommendations:");
    res.status(500).json({ error: "Failed to get recommendations" });
  }
});

router.get("/performance", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform, limit, offset } = req.query;

    const limitNum = Math.min(
      Math.max(parseInt(limit as string, 10) || 50, 1),
      500,
    );
    const offsetNum = Math.min(
      Math.max(parseInt(offset as string, 10) || 0, 0),
      100_000,
    );

    const result = await autopilotLearningService?.getPerformanceHistory(
      userId,
      {
        platform: platform as string | undefined,
        limit: limitNum,
        offset: offsetNum,
      },
    );

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get performance history:");
    res.status(500).json({ error: "Failed to get performance history" });
  }
});

router.post("/record", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = recordPerformanceSchema?.parse(req.body);

    const postData = {
      platform: data.platform,
      contentType: data.contentType,
      hookType: data.hookType,
      hashtags: data.hashtags,
      contentText: data.contentText,
      mediaType: data.mediaType,
      postId: data.postId,
      postedAt: data.postedAt ? new Date(data?.postedAt) : undefined,
      metadata: data.metadata,
    };

    const recordId = await autopilotLearningService?.recordPerformance(
      userId,
      postData,
      data?.analytics,
    );

    res.json({
      success: true,
      recordId,
      message: "Performance data recorded successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.issues });
      return;
    }
    logger.warn({ err: error }, "Failed to record performance:");
    res.status(500).json({ error: "Failed to record performance data" });
  }
});

router.get("/optimal-times/:platform", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params as Record<string, string>;

    const optimalTimes = await autopilotLearningService?.getOptimalPostingTimes(
      userId,
      platform,
    );

    res.json({
      success: true,
      platform,
      optimalTimes,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get optimal posting times:");
    res.status(500).json({ error: "Failed to get optimal posting times" });
  }
});

router.get("/top-content", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.query;

    const topContentTypes =
      await autopilotLearningService?.getTopPerformingContentTypes(
        userId,
        platform as string | undefined,
      );

    res.json({
      success: true,
      contentTypes: topContentTypes,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get top performing content types:");
    res
      .status(500)
      .json({ error: "Failed to get top performing content types" });
  }
});

router.get("/patterns", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const patterns = await autopilotLearningService?.detectPatterns(userId);

    res.json({
      success: true,
      patterns,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to detect patterns:");
    res.status(500).json({ error: "Failed to detect patterns" });
  }
});

router.get("/platform-stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const stats = await autopilotLearningService?.getPlatformStatistics(userId);

    res.json({
      success: true,
      platforms: stats,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get platform statistics:");
    res.status(500).json({ error: "Failed to get platform statistics" });
  }
});

router.post("/generate-insights", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await autopilotLearningService?.generateInsights(userId);

    const insights = await autopilotLearningService?.getLearningInsights(userId);

    res.json({
      success: true,
      message: "Insights generated successfully",
      insights,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to generate insights:");
    res.status(500).json({ error: "Failed to generate insights" });
  }
});

router.get("/hyper/status", requireAuth, async (_req, res) => {
  try {
    const status = await getSocialModelState();

    res.json({
      success: true,
      hyperLearning: {
        enabled: status.ready,
        learningMultiplier: null,
        modelVersion: status.version,
        modelSessionCount: status.sessionCount,
        description: "MaxCore social model state",
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get hyper learning status:");
    res.status(500).json({ error: "Failed to get hyper learning status" });
  }
});

router.get("/hyper/insights", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const hyperInsights =
      await autopilotLearningService.getLearningInsights(userId);
    const modelState = await getSocialModelState();

    res.json({
      success: true,
      hyperInsights,
      count: hyperInsights.length,
      metrics: null,
      modelState,
      capabilities: ["measured_performance_insights", "maxcore_social_model"],
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get hyper insights:");
    res.status(500).json({ error: "Failed to get hyper insights" });
  }
});

router.get("/hyper/predict/:platform", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform } = req.params as Record<string, string>;

    const history = await autopilotLearningService.getPerformanceHistory(
      userId,
      { limit: 50, platform },
    );
    const maxCoreResult = await maxCoreControlTransport.request<{
      success?: boolean;
      analysis?: {
        avg_engagement_rate?: number;
        top_style_tags?: string[];
        best_content_type?: string;
        data_points?: number;
      };
      recommendations?: {
        next_topics?: Array<{ topic?: string; hook?: string; cta?: string }>;
        best_posting_times?: string[];
        content_type?: string;
        style_focus?: string[];
      };
    }>("/platform/social/autopilot", {
      method: "POST",
      authScope: "generation",
      userId,
      timeoutMs: 600_000,
      body: {
        user_id: userId,
        platform,
        target_metric: "engagement",
        recent_posts: history.data,
      },
    });
    if (!maxCoreResult.success || !maxCoreResult.recommendations) {
      throw new Error("MaxCore social autopilot returned an invalid response");
    }

    res.json({
      success: true,
      platform,
      prediction: {
        nextTopics: maxCoreResult.recommendations.next_topics ?? [],
        bestPostingTimes:
          maxCoreResult.recommendations.best_posting_times ?? [],
        contentType: maxCoreResult.recommendations.content_type ?? null,
        styleFocus: maxCoreResult.recommendations.style_focus ?? [],
        predictedEngagement: null,
      },
      analysis: maxCoreResult.analysis ?? null,
      explanation: null,
      microPatternRecommendations:
        maxCoreResult.recommendations.style_focus ?? [],
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to predict optimal content:");
    res.status(500).json({ error: "Failed to predict optimal content" });
  }
});

router.get("/hyper/metrics", requireAuth, async (_req, res) => {
  res.status(503).json({
    error: "HyperLearning metrics are unavailable; local model execution is disabled",
  });
});

router.post("/hyper/start", requireAuth, async (_req, res) => {
  res.status(409).json({
    error: "Local HyperLearning cannot be started; MaxCore training is centrally managed",
  });
});

router.post("/hyper/stop", requireAuth, async (_req, res) => {
  res.status(409).json({
    error: "Local HyperLearning is disabled; MaxCore training is centrally managed",
  });
});

export default router;
