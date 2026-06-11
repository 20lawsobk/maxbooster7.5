import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { db } from "../db.js";
import { aiModels, aiModelVersions } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import {
  unifiedAIController,
  type ContentGenerationOptions,
  type SentimentAnalysisOptions,
  type RecommendationOptions,
  type AdOptimizationOptions,
  type EngagementPredictionOptions,
  type ForecastOptions,
} from "../services/unifiedAIController.js";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import { notificationService } from "../services/notificationService.js";

const _router = Router();

router?.use(aiRateLimiter);

router?.post(
  "/content/generate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _VALID_TONES = [
        "professional",
        "casual",
        "energetic",
        "promotional",
      ] as const;
      const _VALID_PLATFORMS = [
        "twitter",
        "instagram",
        "tiktok",
        "youtube",
        "facebook",
        "linkedin",
      ] as const;
      const _VALID_CONTENT_TYPES = [
        "release",
        "behind-the-scenes",
        "announcement",
        "engagement",
        "promotional",
      ] as const;

      const _rawTone = req?.body.tone as string;
      const _rawPlatform = req?.body.platform as string;
      const _rawContentType = req?.body.contentType as string;

      const _tone = (VALID_TONES as readonly string[]).includes(rawTone)
        ? (rawTone as (typeof VALID_TONES)[number])
        : "casual";
      const _platform = (VALID_PLATFORMS as readonly string[]).includes(
        rawPlatform,
      )
        ? (rawPlatform as (typeof VALID_PLATFORMS)[number])
        : "instagram";
      const _contentType = (VALID_CONTENT_TYPES as readonly string[]).includes(
        rawContentType,
      )
        ? (rawContentType as (typeof VALID_CONTENT_TYPES)[number])
        : "release";

      const options: ContentGenerationOptions = {
        tone,
        platform,
        contentType,
        topic: req?.body.topic,
        maxLength: req?.body.maxLength,
        genre: req?.body.genre,
        trackTitle: req?.body.trackTitle,
        artistName: req?.body.artistName,
        customPrompt: req?.body.customPrompt,
        userId: req?.user?.id,
        projectId: req?.body.projectId,
      };

      const _result = await unifiedAIController?.generateContent(options);

      if (!result?.success) {
        return res?.status(500).json({ error: result?.error });
      }

      res?.json({
        success: true,
        data: result?.data,
        processingTimeMs: result?.processingTimeMs,
        confidence: result?.confidence,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Content generation route error:");
      res?.status(500).json({ error: "Failed to generate content" });
    }
  },
);

router?.post(
  "/sentiment/analyze",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        text,
        includeEmotions,
        includeToxicity,
        includeAspects,
        aspects,
      } = req?.body;

      if (!text || typeof text !== "string") {
        return res
          .status(400)
          .json({ error: "Text is required for sentiment analysis" });
      }

      const options: SentimentAnalysisOptions = {
        text,
        includeEmotions: includeEmotions ?? false,
        includeToxicity: includeToxicity ?? false,
        includeAspects: includeAspects ?? false,
        aspects,
      };

      const _result = await unifiedAIController?.analyzeSentiment(options);

      if (!result?.success) {
        return res?.status(500).json({ error: result?.error });
      }

      res?.json({
        success: true,
        data: result?.data,
        processingTimeMs: result?.processingTimeMs,
        confidence: result?.confidence,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Sentiment analysis route error:");
      res?.status(500).json({ error: "Failed to analyze sentiment" });
    }
  },
);

router?.post(
  "/recommendations/get",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { type, seedIds, limit, hybridWeight } = req?.body;

      if (!type || !["tracks", "artists", "similar"].includes(type)) {
        return res.status(400).json({
          error:
            "Valid recommendation type is required (tracks, artists, similar)",
        });
      }

      const options: RecommendationOptions = {
        userId: req?.user?.id,
        type,
        seedIds,
        limit: limit ?? 20,
        hybridWeight: hybridWeight ?? 0.5,
      };

      const _result = await unifiedAIController?.getRecommendations(options);

      if (!result?.success) {
        return res?.status(500).json({ error: result?.error });
      }

      res?.json({
        success: true,
        data: result?.data,
        processingTimeMs: result?.processingTimeMs,
        confidence: result?.confidence,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Recommendations route error:");
      res?.status(500).json({ error: "Failed to get recommendations" });
    }
  },
);

router?.post(
  "/ads/optimize",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { campaign, action, campaigns, totalBudget, forecastPeriod } =
        req?.body;

      if (!campaign) {
        return res?.status(400).json({ error: "Campaign data is required" });
      }

      if (
        !action ||
        ![
          "score",
          "optimize_budget",
          "predict_creative",
          "forecast_roi",
        ].includes(action)
      ) {
        return res.status(400).json({
          error:
            "Valid action is required (score, optimize_budget, predict_creative, forecast_roi)",
        });
      }

      const _defaultMetrics = {
        ctr: 0.02,
        cvr: 0.05,
        roas: 1.5,
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cpc: 0.5,
        cpa: 10,
      };
      const _defaultTargeting = {
        ageMin: 18,
        ageMax: 65,
        interests: [],
        locations: [],
        gender: "all",
        customAudiences: [],
        lookalikes: [],
        excludedAudiences: [],
      };
      const _enrichedCampaign = {
        ...campaign,
        metrics: campaign?.metrics || defaultMetrics,
        targeting: campaign?.targeting || defaultTargeting,
        creatives: campaign?.creatives || [],
        budget: campaign?.budget || 100,
        dailyBudget: campaign?.dailyBudget || 10,
        historicalData: campaign?.historicalData || [],
        platform: campaign?.platform || "instagram",
        objective: campaign?.objective || "engagement",
        status: campaign?.status || "active",
        startDate: campaign?.startDate || new Date().toISOString(),
        endDate:
          campaign?.endDate ||
          new Date(Date?.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const options: AdOptimizationOptions = {
        campaign: enrichedCampaign,
        action,
        campaigns,
        totalBudget,
        forecastPeriod,
      };

      const _result = await unifiedAIController?.optimizeAd(options);

      if (!result?.success) {
        return res?.status(500).json({ error: result?.error });
      }

      res?.json({
        success: true,
        data: result?.data,
        processingTimeMs: result?.processingTimeMs,
        confidence: result?.confidence,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Ad optimization route error:");
      res?.status(500).json({ error: "Failed to optimize ads" });
    }
  },
);

router?.post(
  "/social/predict",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { platform, content, action, postsPerWeek } = req?.body;

      if (!platform) {
        return res?.status(400).json({ error: "Platform is required" });
      }

      if (
        !action ||
        ![
          "predict_engagement",
          "viral_potential",
          "best_time",
          "recommend_type",
          "optimize_schedule",
        ].includes(action)
      ) {
        return res.status(400).json({
          error:
            "Valid action is required (predict_engagement, viral_potential, best_time, recommend_type, optimize_schedule)",
        });
      }

      const options: EngagementPredictionOptions = {
        platform,
        content: {
          text: content?.text ?? "",
          contentType: content?.contentType ?? "text",
          hashtags: content?.hashtags ?? [],
          topics: content?.topics ?? [],
          hasEmoji: content?.hasEmoji ?? false,
          scheduledTime: content?.scheduledTime,
        },
        action,
        postsPerWeek,
      };

      const _result = await unifiedAIController?.predictEngagement(options);

      if (!result?.success) {
        return res?.status(500).json({ error: result?.error });
      }

      if (action === "viral_potential" && result?.data && req?.user?.id) {
        const score: number =
          (result?.data as Record<string, unknown>).overallScore ?? 0;
        if (score >= 0.75) {
          const _pct = Math?.round(score * 100);
          const _platformLabel =
            platform?.charAt(0).toUpperCase() + platform?.slice(1);
          notificationService
            .send({
              userId: req?.user.id,
              type: "platform_trending_topic",
              title: `🔥 High Viral Potential Detected on ${platformLabel}`,
              message: `Your content scored ${pct}% viral potential — above the 75% threshold. Post it soon to maximize reach while engagement conditions are favorable.`,
              link: "/social?tab=compose",
              metadata: {
                platform,
                viralScore: score,
                confidence: result?.confidence,
              },
            })
            .catch((err) =>
              logger?.warn(
                { err: err },
                "Failed to send viral opportunity notification:",
              ),
            );
        }
      }

      res?.json({
        success: true,
        data: result?.data,
        processingTimeMs: result?.processingTimeMs,
        confidence: result?.confidence,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Social prediction route error:");
      res?.status(500).json({ error: "Failed to predict social engagement" });
    }
  },
);

router?.post("/forecast", requireAuth, async (req: Request, res: Response) => {
  try {
    const { metric, horizon, historicalData, timestamps } = req?.body;

    if (
      !metric ||
      !["streams", "revenue", "followers", "engagement"].includes(metric)
    ) {
      return res.status(400).json({
        error:
          "Valid metric is required (streams, revenue, followers, engagement)",
      });
    }

    if (!horizon || ![7, 30, 90].includes(horizon)) {
      return res
        .status(400)
        .json({ error: "Valid horizon is required (7, 30, or 90 days)" });
    }

    if (
      !historicalData ||
      !Array?.isArray(historicalData) ||
      historicalData?.length < 10
    ) {
      return res
        .status(400)
        .json({ error: "At least 10 historical data points are required" });
    }

    const options: ForecastOptions = {
      metric,
      horizon,
      historicalData,
      timestamps: timestamps?.map((t: string) => new Date(t)),
    };

    const _result = await unifiedAIController?.forecastMetrics(options);

    if (!result?.success) {
      return res?.status(500).json({ error: result?.error });
    }

    res?.json({
      success: true,
      data: result?.data,
      processingTimeMs: result?.processingTimeMs,
      confidence: result?.confidence,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Forecast route error:");
    res?.status(500).json({ error: "Failed to generate forecast" });
  }
});

router?.get("/health", requireAuth, async (_req: Request, res: Response) => {
  try {
    const _health = await unifiedAIController?.getAIHealthStatus();

    // Python AI / external model services are optional probes — never block
    // the caller with a 503. Unhealthy AI services degrade gracefully and the
    // platform falls back to MaxCore. Return 207 (multi-status) at worst so
    // deployment health checks and uptime monitors stay green.
    const _statusCode = health?.overall === "healthy" ? 200 : 207;

    res?.status(statusCode).json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger?.warn({ err: error }, "AI health check route error:");
    // Always return 200 — AI service failures are non-fatal, platform still works
    res?.status(200).json({
      success: false,
      error: "Failed to get AI health status",
      data: {
        overall: "degraded",
        lastChecked: new Date(),
        services: {},
        modelStats: { registeredModels: 0, activeModels: 0, trainedModels: 0 },
      },
    });
  }
});

router?.post(
  "/hashtags/generate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { topic, genre, platform, tone, count } = req?.body;

      const _hashtags = unifiedAIController?.generateHashtags({
        topic,
        genre,
        platform,
        tone,
        count: count ?? 10,
      });

      res?.json({
        success: true,
        data: { hashtags },
      });
    } catch (error) {
      logger?.warn({ err: error }, "Hashtag generation route error:");
      res?.status(500).json({ error: "Failed to generate hashtags" });
    }
  },
);

router?.post(
  "/toxicity/analyze",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { text } = req?.body;

      if (!text || typeof text !== "string") {
        return res
          .status(400)
          .json({ error: "Text is required for toxicity analysis" });
      }

      const _result = unifiedAIController?.analyzeToxicity(text);

      res?.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Toxicity analysis route error:");
      res?.status(500).json({ error: "Failed to analyze toxicity" });
    }
  },
);

router?.post(
  "/emotions/detect",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { text } = req?.body;

      if (!text || typeof text !== "string") {
        return res
          .status(400)
          .json({ error: "Text is required for emotion detection" });
      }

      const _result = unifiedAIController?.detectEmotions(text);

      res?.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Emotion detection route error:");
      res?.status(500).json({ error: "Failed to detect emotions" });
    }
  },
);

router?.get("/trends", requireAuth, async (req: Request, res: Response) => {
  try {
    const _platforms = req?.query.platforms
      ? (req?.query.platforms as string).split(",")
      : ["twitter", "instagram", "tiktok"];

    const _trends = unifiedAIController?.detectTrends(
      platforms as Record<string, unknown>,
    );

    res?.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Trends detection route error:");
    res?.status(500).json({ error: "Failed to detect trends" });
  }
});

router?.post(
  "/content/adapt",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { content, originalPlatform, targetPlatform } = req?.body;

      if (!content || !originalPlatform || !targetPlatform) {
        return res.status(400).json({
          error: "Content, originalPlatform, and targetPlatform are required",
        });
      }

      const _adaptedContent = unifiedAIController?.adaptContent(
        content,
        originalPlatform,
        targetPlatform,
      );

      res?.json({
        success: true,
        data: adaptedContent,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Content adaptation route error:");
      res?.status(500).json({ error: "Failed to adapt content" });
    }
  },
);

router?.get("/models", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, type } = req?.query;

    let query = db?.select().from(aiModels);
    const conditions: unknown[] = [];
    if (status && typeof status === "string") {
      conditions?.push(eq(aiModels?.status, status));
    }
    if (type && typeof type === "string") {
      conditions?.push(eq(aiModels?.modelType, type));
    }

    let models;
    if (conditions?.length > 0) {
      models = await query?.where(and(...conditions)).limit(500);
    } else {
      models = await query?.limit(500);
    }

    res?.json({
      success: true,
      data: models,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Get models route error:");
    res?.status(500).json({ error: "Failed to get registered models" });
  }
});

router?.get(
  "/models/:modelId/performance",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { modelId } = req?.params;

      const _versions = await db
        .select()
        .from(aiModelVersions)
        .where(eq(aiModelVersions?.modelId, modelId))
        .limit(100);
      const [model] = await db
        .select()
        .from(aiModels)
        .where(eq(aiModels?.id, modelId))
        .limit(1);

      res?.json({
        success: true,
        data: {
          model: model || null,
          versions,
          performance: model?.performance || {},
        },
      });
    } catch (error) {
      logger?.warn({ err: error }, "Get model performance route error:");
      res?.status(500).json({ error: "Failed to get model performance" });
    }
  },
);

router?.get("/stats", requireAuth, async (_req: Request, res: Response) => {
  try {
    const _stats = unifiedAIController?.getServiceStats();

    res?.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Get AI stats route error:");
    res?.status(500).json({ error: "Failed to get AI stats" });
  }
});

router?.post(
  "/analytics/predict",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { metric, timeframe } = req?.body;

      if (!metric || !["streams", "engagement", "revenue"].includes(metric)) {
        return res.status(400).json({
          error: "Valid metric is required (streams, engagement, revenue)",
        });
      }

      if (!timeframe || !["7d", "30d", "90d"].includes(timeframe)) {
        return res
          .status(400)
          .json({ error: "Valid timeframe is required (7d, 30d, 90d)" });
      }

      const _prediction = await unifiedAIController?.predictAnalyticsMetric({
        metric,
        timeframe,
      });

      res?.json({
        success: true,
        data: prediction,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Analytics prediction route error:");
      res?.status(500).json({ error: "Failed to predict analytics metric" });
    }
  },
);

router?.get("/insights", requireAuth, async (_req: Request, res: Response) => {
  try {
    const _insights = await unifiedAIController?.generateInsights();

    res?.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Generate insights route error:");
    res?.status(500).json({ error: "Failed to generate insights" });
  }
});

router?.get("/anomalies", requireAuth, async (_req: Request, res: Response) => {
  try {
    const _anomalies = await unifiedAIController?.detectAnomalies();

    res?.json({
      success: true,
      data: anomalies,
    });
  } catch (error) {
    logger?.warn({ err: error }, "Detect anomalies route error:");
    res?.status(500).json({ error: "Failed to detect anomalies" });
  }
});

router?.post(
  "/churn/predict",
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const _prediction = await unifiedAIController?.predictChurn();

      res?.json({
        success: true,
        data: prediction,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Churn prediction route error:");
      res?.status(500).json({ error: "Failed to predict churn" });
    }
  },
);

router?.post(
  "/revenue/forecast",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { timeframe } = req?.body;

      const _forecast = await unifiedAIController?.forecastRevenue(
        timeframe || "30d",
      );

      res?.json({
        success: true,
        data: forecast,
      });
    } catch (error) {
      logger?.warn({ err: error }, "Revenue forecast route error:");
      res?.status(500).json({ error: "Failed to forecast revenue" });
    }
  },
);

// ============================================================================
// PERSONAL AD NETWORK - ORGANIC GROWTH ENDPOINTS
// Achieve paid-ad-level results without ad spend
// ============================================================================

router?.post(
  "/organic/optimize",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { profiles, content, goals } = req?.body;

      if (!profiles || !Array?.isArray(profiles)) {
        return res
          .status(400)
          .json({ error: "Social profiles array is required" });
      }

      if (!content || !content?.text) {
        return res?.status(400).json({ error: "Content with text is required" });
      }

      const _result = await unifiedAIController?.optimizeOrganicGrowth({
        profiles,
        content,
        goals: goals || {},
      });

      res?.json({
        success: true,
        data: result,
        message: "Personal Ad Network optimization complete",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Organic optimization route error:");
      res?.status(500).json({ error: "Failed to optimize organic growth" });
    }
  },
);

router?.post(
  "/organic/roi",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { platformResults } = req?.body;

      if (!platformResults) {
        return res
          .status(400)
          .json({ error: "Platform results data is required" });
      }

      const _result = await unifiedAIController?.calculateOrganicROI({
        platformResults,
        totalReach: Object?.values(
          platformResults as Record<string, { impressions: number }>,
        ).reduce(
          (sum: number, p: { impressions: number }) => sum + p?.impressions,
          0,
        ),
        totalEngagements: Object?.values(
          platformResults as Record<string, { engagements: number }>,
        ).reduce(
          (sum: number, p: { engagements: number }) => sum + p?.engagements,
          0,
        ),
      });

      res?.json({
        success: true,
        data: result,
        message: "Organic ROI calculated - see equivalent ad spend savings",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Organic ROI route error:");
      res?.status(500).json({ error: "Failed to calculate organic ROI" });
    }
  },
);

router?.post(
  "/organic/schedule",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { profiles, contentQueue, goals } = req?.body;

      if (!profiles || !Array?.isArray(profiles)) {
        return res
          .status(400)
          .json({ error: "Social profiles array is required" });
      }

      if (!contentQueue || !Array?.isArray(contentQueue)) {
        return res
          .status(400)
          .json({ error: "Content queue array is required" });
      }

      const _result = await unifiedAIController?.generateOrganicSchedule({
        profiles,
        contentQueue,
        goals: goals || {},
      });

      res?.json({
        success: true,
        data: result,
        message: "Optimal organic posting schedule generated",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Organic schedule route error:");
      res?.status(500).json({ error: "Failed to generate organic schedule" });
    }
  },
);

router?.get(
  "/organic/network-analysis",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _networkAnalysis =
        await unifiedAIController?.analyzePersonalAdNetwork(req?.user?.id);

      res?.json({
        success: true,
        data: networkAnalysis,
        message: "Personal Ad Network analysis complete",
      });
    } catch (error) {
      logger?.warn({ err: error }, "Network analysis route error:");
      res?.status(500).json({ error: "Failed to analyze personal ad network" });
    }
  },
);

// ── MaxCore Diffusion / Training Time Simulator status endpoints ──────────────
// Port 8008 (api_server_v4.py) is the primary content generation gateway.
// These routes expose its training state and simulator progress to the frontend.

const _DIT24_BASE = `http://localhost:${process?.env.VIDEO_DIFFUSION_PORT ?? 8008}`;

router?.get(
  "/diffusion/status",
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const _ctrl = await fetch(`${DIT24_BASE}/status`, {
        signal: AbortSignal?.timeout(5_000),
      });
      if (!ctrl?.ok) {
        return res
          .status(502)
          .json({ error: "Diffusion gateway unavailable", port: 8008 });
      }
      const _data = await ctrl?.json();
      res?.json({ success: true, data });
    } catch (err) {
      res.status(503).json({
        error: "Diffusion gateway not running",
        port: 8008,
        detail: String(err),
      });
    }
  },
);

router?.get(
  "/simulator/status",
  requireAuth,
  async (_req: Request, res: Response) => {
    try {
      const _ctrl = await fetch(`${DIT24_BASE}/train/simulator/status`, {
        signal: AbortSignal?.timeout(5_000),
      });
      if (!ctrl?.ok) {
        return res
          .status(502)
          .json({ error: "Simulator endpoint unavailable", port: 8008 });
      }
      const _data = await ctrl?.json();
      res?.json({ success: true, data });
    } catch (err) {
      res.status(503).json({
        error: "Diffusion gateway not running",
        port: 8008,
        detail: String(err),
      });
    }
  },
);

router?.get("/diffusion/ready", async (_req: Request, res: Response) => {
  try {
    const _ctrl = await fetch(`${DIT24_BASE}/ready`, {
      signal: AbortSignal?.timeout(3_000),
    });
    const _data = ctrl?.ok ? await ctrl?.json() : { ready: false };
    res?.json({ success: true, data });
  } catch {
    res?.json({
      success: true,
      data: { ready: false, reason: "gateway_offline" },
    });
  }
});

export default router;
