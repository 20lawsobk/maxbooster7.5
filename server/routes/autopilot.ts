import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { storage } from "../storage.js";
import { logger } from "../logger.js";
import { aiModelManager } from "../services/aiModelManager.js";
import { promotionalToolsService } from "../services/promotionalToolsService.js";
import { db } from "../db";
import { socialAutopilotContent } from "@shared/schema";
import { eq, count, lt, gte, gt, min, desc, and, isNotNull } from "drizzle-orm";

const router = Router();

// Configuration schema
const autopilotConfigSchema = z.object({
  enabled: z.boolean(),
  platforms: z.array(z.string()).optional(),
  postingFrequency: z.enum(["hourly", "daily", "weekly"]).optional(),
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
router?.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const now = new Date();

    const config = await storage?.getAutopilotConfig(userId).catch(() => null);

    let socialTrained = false,
      socialVersion = "1.0.0";
    let advertisingTrained = false,
      advertisingVersion = "1.0.0";
    try {
      const socialModel = await aiModelManager?.getSocialAutopilot(userId);
      socialTrained = socialModel?.getIsTrained();
      socialVersion = socialModel?.getVersion();
    } catch (e) {
      logger.warn(
        { err: e },
        "getSocialAutopilot unavailable, using defaults:",
      );
    }
    try {
      const advertisingModel =
        await aiModelManager?.getAdvertisingAutopilot(userId);
      advertisingTrained = advertisingModel?.getIsTrained();
      advertisingVersion = advertisingModel?.getVersion();
    } catch (e) {
      logger.warn(
        { err: e },
        "getAdvertisingAutopilot unavailable, using defaults:",
      );
    }

    // Real activity stats from socialAutopilotContent table
    const [totalGenRow, publishedRow, pendingRow, nextJobRow, recentRows] =
      await Promise?.all([
        db
          .select({ value: count() })
          .from(socialAutopilotContent)
          .where(eq(socialAutopilotContent?.userId, userId)),
        db
          .select({ value: count() })
          .from(socialAutopilotContent)
          .where(
            and(
              eq(socialAutopilotContent?.userId, userId),
              isNotNull(socialAutopilotContent?.postingTime),
              lt(socialAutopilotContent?.postingTime, now),
            ),
          ),
        db
          .select({ value: count() })
          .from(socialAutopilotContent)
          .where(
            and(
              eq(socialAutopilotContent?.userId, userId),
              gte(socialAutopilotContent?.postingTime, now),
            ),
          ),
        db
          .select({ value: min(socialAutopilotContent?.postingTime) })
          .from(socialAutopilotContent)
          .where(
            and(
              eq(socialAutopilotContent?.userId, userId),
              gt(socialAutopilotContent?.postingTime, now),
            ),
          ),
        db
          .select()
          .from(socialAutopilotContent)
          .where(eq(socialAutopilotContent?.userId, userId))
          .orderBy(desc(socialAutopilotContent?.createdAt))
          .limit(10),
      ]).catch(() => [[], [], [], [], []]);

    const totalGenerated = Number((totalGenRow as unknown[])[0]?.value ?? 0);
    const totalPublished = Number((publishedRow as unknown[])[0]?.value ?? 0);
    const pendingCount = Number((pendingRow as unknown[])[0]?.value ?? 0);
    const nextScheduledJob = (nextJobRow as unknown[])[0]?.value ?? null;

    const recentActivity = (recentRows as unknown[]).map(
      (row: Record<string, unknown>) => {
        const isPast = row?.postingTime && new Date(row?.postingTime) < now;
        const isFuture = row?.postingTime && new Date(row?.postingTime) >= now;
        return {
          status: isPast ? "completed" : isFuture ? "scheduled" : "pending",
          title: `${row?.type ? row?.type.charAt(0).toUpperCase() + row?.type.slice(1) : "Content"} on ${row?.platform || "social media"}`,
          description:
            `${row?.format || "text"} • ${row?.hookType || ""} hook • ${row?.tone || ""} tone`
              .replace(/• {2,}/g, "• ")
              .replace(/^• |• $/g, ""),
          time: row.postingTime || row?.createdAt,
        };
      },
    );

    const defaultConfig = {
      enabled: false,
      platforms: [],
      postingFrequency: "daily",
      brandVoice: "professional",
      contentTypes: ["tips", "insights"],
      autoPublish: false,
      useMultimodalAnalysis: true,
      autoAnalyzeBeforePosting: true,
      minConfidenceThreshold: 0.7,
    };
    const activeConfig = config || defaultConfig;

    res.json({
      isRunning: activeConfig.enabled || false,
      config: activeConfig || {
        enabled: false,
        platforms: [],
        postingFrequency: "daily",
        brandVoice: "professional",
        contentTypes: ["tips", "insights"],
        autoPublish: false,
        useMultimodalAnalysis: true,
        autoAnalyzeBeforePosting: true,
        minConfidenceThreshold: 0.7,
      },
      status: {
        totalGenerated,
        totalPublished,
        pendingCount,
        nextScheduledJob,
        recentActivity,
      },
      modelStatus: {
        social: { trained: socialTrained, version: socialVersion },
        advertising: {
          trained: advertisingTrained,
          version: advertisingVersion,
        },
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get autopilot status:");
    res.status(500).json({ error: "Failed to get autopilot status" });
  }
});

// Start autopilot
router?.post("/start", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    let config = await storage?.getAutopilotConfig(userId);
    if (!config) {
      config = {
        enabled: true,
        platforms: ["facebook", "instagram", "twitter"],
        postingFrequency: "daily",
        brandVoice: "professional",
        contentTypes: ["tips", "insights"],
        autoPublish: false,
        useMultimodalAnalysis: true,
        autoAnalyzeBeforePosting: true,
        minConfidenceThreshold: 0.7,
      };
    } else {
      config.enabled = true;
      if (
        config?.autoAnalyzeBeforePosting === undefined ||
        config?.autoAnalyzeBeforePosting === null
      ) {
        config.autoAnalyzeBeforePosting = true;
      }
      if (
        config?.minConfidenceThreshold === undefined ||
        config?.minConfidenceThreshold === null
      ) {
        config.minConfidenceThreshold = 0.7;
      }
    }

    await storage?.saveAutopilotConfig(userId, config);

    setImmediate(async () => {
      try {
        const engine = promotionalToolsService?.getAutopilotForUser(userId);
        await engine?.configure({
          enabled: true,
          platforms: config.platforms || ["instagram", "twitter"],
          postingFrequency: config.postingFrequency || "daily",
          brandVoice: config.brandVoice || "professional",
          contentTypes: config.contentTypes || ["tips", "insights"],
          autoPublish: config.autoPublish || false,
        });
        logger.info(`✅ Autopilot engine started for user ${userId}`);
      } catch (err) {
        logger.warn(
          { err: err },
          `⚠️ Autopilot engine start failed for user ${userId}:`,
        );
      }
    });

    logger.info(`✅ Autopilot started for user ${userId}`);

    res.json({
      success: true,
      message: "Autopilot activated",
      config,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to start autopilot:");
    res.status(500).json({ error: "Failed to start autopilot" });
  }
});

// Stop autopilot
router?.post("/stop", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const config = await storage?.getAutopilotConfig(userId);
    if (config) {
      config.enabled = false;
      await storage?.saveAutopilotConfig(userId, config);
    }

    setImmediate(async () => {
      try {
        const engine = promotionalToolsService?.getAutopilotForUser(userId);
        await engine?.configure({ enabled: false });
        logger.info(`⏸️ Autopilot engine stopped for user ${userId}`);
      } catch (err) {
        logger.warn(
          { err: err },
          `⚠️ Autopilot engine stop failed for user ${userId}:`,
        );
      }
    });

    logger.info(`⏸️ Autopilot stopped for user ${userId}`);

    res.json({
      success: true,
      message: "Autopilot paused",
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to stop autopilot:");
    res.status(500).json({ error: "Failed to stop autopilot" });
  }
});

// Configure autopilot
router?.post("/configure", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const config = autopilotConfigSchema?.parse(req.body);

    await storage?.saveAutopilotConfig(userId, config);

    if (config?.enabled) {
      setImmediate(async () => {
        try {
          const engine = promotionalToolsService?.getAutopilotForUser(userId);
          await engine?.configure({
            enabled: config.enabled,
            platforms: config.platforms || [],
            postingFrequency: config.postingFrequency || "daily",
            brandVoice: config.brandVoice || "professional",
            contentTypes: config.contentTypes || [],
            autoPublish: config.autoPublish || false,
          });
        } catch (err) {
          logger.warn(
            { err: err },
            `⚠️ Autopilot engine configure failed for user ${userId}:`,
          );
        }
      });
    }

    logger.info(`⚙️ Autopilot configured for user ${userId}`);

    res.json({
      success: true,
      message: "Configuration updated",
      config,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: "Invalid configuration", details: error.issues });
      return;
    }
    logger.warn({ err: error }, "Failed to configure autopilot:");
    res.status(500).json({ error: "Failed to update configuration" });
  }
});

// Generate AI content recommendations using multimodal analysis
router?.post("/recommend", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { contentType, includeMultimodal } = req.body;

    const socialModel = await aiModelManager?.getSocialAutopilot(userId);

    let multimodalFeatures = null;
    if (includeMultimodal !== false) {
      const recentAnalyzedContent = await storage?.getRecentAnalyzedContent(
        userId,
        10,
      );
      if (recentAnalyzedContent && recentAnalyzedContent?.length > 0) {
        multimodalFeatures = recentAnalyzedContent[0].features;
      }
    }

    const recommendations = await socialModel?.generateContentRecommendations(
      contentType || "general",
      multimodalFeatures,
    );

    res.json({
      success: true,
      recommendations,
      usedMultimodal: !!multimodalFeatures,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to generate recommendations:");
    res.status(500).json({ error: "Failed to generate recommendations" });
  }
});

// Predict engagement for content with multimodal features
router?.post("/predict-engagement", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { platform, content, multimodalFeatures } = req.body;

    if (!platform || !content) {
      res.status(400).json({ error: "Platform and content are required" });
      return;
    }

    const socialModel = await aiModelManager?.getSocialAutopilot(userId);

    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    const features = {
      platform,
      contentLength: content.length,
      hasHashtags: content.includes("#"),
      hasEmojis: emojiRegex.test(content),
      hasLinks: content.includes("http"),
      ...multimodalFeatures,
    };

    const prediction = await socialModel?.predictEngagement(features);

    res.json({
      success: true,
      prediction,
      usedMultimodal: !!multimodalFeatures,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to predict engagement:");
    res.status(500).json({ error: "Failed to predict engagement" });
  }
});

// Save analyzed content features for autopilot training
router?.post("/save-features", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { contentType, features, contentUrl, contentText } = req.body;

    if (!contentType || !features) {
      res.status(400).json({ error: "Content type and features are required" });
      return;
    }

    const featuresToSave: Record<string, unknown> = {
      contentType,
      contentUrl,
      contentText,
    };

    if (contentType === "image") {
      featuresToSave.imageComposition = features?.composition;
      featuresToSave.imageColors = features?.colors;
      featuresToSave.imageEngagement = features?.engagement;
      featuresToSave.imageQuality = features?.quality;
    } else if (contentType === "video") {
      featuresToSave.videoTechnical = features?.technical;
      featuresToSave.videoContent = features?.content;
      featuresToSave.videoEngagement = features?.engagement;
      featuresToSave.videoThumbnail = features?.thumbnail;
    } else if (contentType === "audio") {
      featuresToSave.audioTechnical = features?.technical;
      featuresToSave.audioEngagement = features?.engagement;
      featuresToSave.audioMood = features?.mood;
    } else if (contentType === "text") {
      featuresToSave.textSentiment = features?.sentiment;
      featuresToSave.textReadability = features?.readability;
      featuresToSave.textEngagement = features?.engagement;
      featuresToSave.textKeywords = features?.keywords;
    } else if (contentType === "website") {
      featuresToSave.websiteTechnical = features?.technical;
      featuresToSave.websiteContent = features?.content;
      featuresToSave.websiteEngagement = features?.engagement;
      featuresToSave.websiteSeo = features?.seo;
    }

    const featureId = await storage?.saveAnalyzedContentFeatures(
      userId,
      featuresToSave,
    );

    logger.info(
      `✅ Saved ${contentType} features for user ${userId} autopilot training`,
    );

    res.json({
      success: true,
      message: "Features saved for autopilot training",
      featureId,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to save features:");
    res.status(500).json({ error: "Failed to save features for training" });
  }
});

// Train autopilot AI with user's historical data + analyzed multimodal features
router?.post("/train", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info(
      `🤖 Starting autopilot AI training for user ${userId} with multimodal features...`,
    );

    const posts = await storage?.getAllPosts(userId);
    const campaigns = await storage?.getAllCampaigns(userId);
    const analyzedFeatures =
      await storage?.getAnalyzedContentForTraining(userId);

    logger.info(
      `📊 Loaded ${posts?.length} posts, ${campaigns?.length} campaigns, ${analyzedFeatures?.length} analyzed features`,
    );

    const socialModel = await aiModelManager?.getSocialAutopilot(userId);
    const advertisingModel =
      await aiModelManager?.getAdvertisingAutopilot(userId);

    const enrichedPosts = socialModel?.enrichPostsWithAnalyzedFeatures(
      posts,
      analyzedFeatures,
    );
    logger.info(
      `✅ Enriched ${enrichedPosts?.filter((p: Record<string, unknown>) => p?.contentAnalysis).length} posts with multimodal features`,
    );

    const enrichedCampaigns =
      advertisingModel?.enrichCampaignsWithAnalyzedFeatures(
        campaigns,
        analyzedFeatures,
      );
    logger.info(
      `✅ Enriched ${enrichedCampaigns?.filter((c: Record<string, unknown>) => c?.contentAnalysis).length} campaigns with multimodal features`,
    );

    let socialResult = null;
    let advertisingResult = null;

    try {
      if (enrichedPosts?.length >= 50) {
        socialResult =
          await socialModel?.trainOnUserEngagementData(enrichedPosts);
        logger.info(
          `✅ Social autopilot trained: ${socialResult?.postsProcessed} posts`,
        );
      } else {
        logger.warn(
          `⚠️ Not enough posts for social training (${enrichedPosts?.length}/50)`,
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Social model training failed:");
    }

    try {
      if (enrichedCampaigns?.length >= 30) {
        advertisingResult =
          await advertisingModel?.trainOnHistoricalCampaigns(enrichedCampaigns);
        logger.info(
          `✅ Advertising autopilot trained: ${advertisingResult?.campaignsProcessed} campaigns`,
        );
      } else {
        logger.warn(
          `⚠️ Not enough campaigns for advertising training (${enrichedCampaigns?.length}/30)`,
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Advertising model training failed:");
    }

    res.json({
      success: true,
      message: "Autopilot AI training completed with multimodal features",
      results: {
        social: socialResult,
        advertising: advertisingResult,
      },
      dataUsed: {
        posts: enrichedPosts.length,
        campaigns: enrichedCampaigns.length,
        analyzedFeatures: analyzedFeatures.length,
        enrichedPosts: enrichedPosts.filter(
          (p: Record<string, unknown>) => p?.contentAnalysis,
        ).length,
        enrichedCampaigns: enrichedCampaigns.filter(
          (c: Record<string, unknown>) => c?.contentAnalysis,
        ).length,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to train autopilot:");
    res.status(500).json({ error: "Failed to train autopilot AI" });
  }
});

export default router;
