// @ts-nocheck
import { Router, type Response } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { storage } from "../storage.js";
import { logger } from "../logger.js";
import { aiModelManager } from "../services/aiModelManager.js";
import { autopilotLearningService } from "../services/autopilotLearningService.js";
import {
  MaxCoreControlError,
  maxCoreControlTransport,
} from "../services/maxcoreControlTransport.js";
import { promotionalToolsService } from "../services/promotionalToolsService.js";
import { db } from "../db";
import { posts, socialAutopilotContent } from "@shared/schema";
import { eq, count, lt, gte, gt, min, desc, and, isNotNull, sql } from "drizzle-orm";

const router = Router();

// Configuration schema
const autopilotConfigSchema = z.object({
  enabled: z.boolean(),
  platforms: z.array(z.string()).optional(),
  postingFrequency: z.enum(["hourly", "twice-daily", "daily", "weekly"]).optional(),
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

const recommendationRequestSchema = z.object({
  platform: z.string().trim().min(1).max(64).optional(),
  contentType: z.string().trim().min(1).max(80).optional(),
  includeMultimodal: z.boolean().optional().default(true),
});

const engagementPredictionRequestSchema = z.object({
  platform: z.string().trim().min(1).max(64),
  content: z.string().min(1).max(20_000),
  multimodalFeatures: z.unknown().optional(),
});

const storageTrainingRequestSchema = z
  .object({
    epochs: z.coerce.number().int().min(1).max(20).optional(),
    batch_size: z.coerce.number().int().min(8).max(512).optional(),
    learning_rate: z.coerce.number().positive().optional(),
    max_batches: z.coerce.number().int().min(1).optional(),
    save_checkpoint: z.boolean().optional(),
  })
  .strict();

function sendMaxCoreFailure(
  res: Response,
  error: unknown,
  message: string,
  fallbackStatus = 502,
): void {
  const controlError =
    error instanceof MaxCoreControlError ? error : undefined;
  const details = controlError?.details;
  const body =
    details && typeof details === "object"
      ? details
      : {
          error: message,
          detail: error instanceof Error ? error.message : String(error),
        };
  res.status(controlError?.status ?? fallbackStatus).json(body);
}

function validateStorageTrainingResponse(
  value: unknown,
): Record<string, unknown> {
  const invalidResponse = () =>
    new MaxCoreControlError(
      "MaxCore returned an invalid storage-training response",
      502,
      {
        error: "Invalid MaxCore training response",
        response: value,
      },
    );

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse();
  }

  const response = value as Record<string, unknown>;
  if (
    response.status === "started" &&
    typeof response.job_id === "string" &&
    response.job_id.length > 0
  ) {
    return response;
  }
  if (
    response.status === "already_running" &&
    response.training_state !== null &&
    typeof response.training_state === "object" &&
    !Array.isArray(response.training_state)
  ) {
    return response;
  }
  throw invalidResponse();
}

// Get autopilot status
router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const now = new Date();

    const config = await storage.getAutopilotConfig(userId).catch(() => null);

    let socialModel;
    try {
      socialModel = await aiModelManager.getSocialAutopilot(userId);
    } catch (error) {
      logger.warn({ err: error }, "Failed to read MaxCore autopilot status:");
      sendMaxCoreFailure(
        res,
        error,
        "MaxCore autopilot status is unavailable",
      );
      return;
    }

    const autopilotPosts = and(
      eq(posts.userId, userId),
      sql`${posts.engagement}->>'createdBy' = 'social_autopilot'`,
    );
    const confirmedReceipt = sql`(
      jsonb_path_exists(
        COALESCE(${posts.engagement}, '{}'::jsonb),
        '$.postingResults[*] ? (@.outcome == "confirmed" && @.success == true)'
      )
      OR jsonb_path_exists(
        COALESCE(${posts.engagement}, '{}'::jsonb),
        '$.results[*] ? (@.outcome == "confirmed" && @.success == true)'
      )
      OR jsonb_path_exists(
        COALESCE(${posts.engagement}, '[]'::jsonb),
        '$[*] ? (@.outcome == "confirmed" && @.success == true)'
      )
    )`;
    const [totalGenRow, publishedRow, pendingRow, nextJobRow, recentRows] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(posts)
          .where(autopilotPosts),
        db
          .select({ value: count() })
          .from(posts)
          .where(and(autopilotPosts, confirmedReceipt)),
        db
          .select({ value: count() })
          .from(posts)
          .where(
            and(
              autopilotPosts,
              sql`${posts.status} IN ('pending', 'scheduled')`,
            ),
          ),
        db
          .select({ value: min(posts.scheduledAt) })
          .from(posts)
          .where(
            and(
              autopilotPosts,
              sql`${posts.status} IN ('pending', 'scheduled')`,
              sql`${posts.engagement}->>'reviewRequired' IS DISTINCT FROM 'true'`,
              gt(posts.scheduledAt, now),
            ),
          ),
        db
          .select()
          .from(posts)
          .where(autopilotPosts)
          .orderBy(desc(posts.createdAt))
          .limit(10),
      ]);

    const totalGenerated = Number(((totalGenRow as unknown[])[0] as any)?.value ?? 0);
    const totalPublished = Number(((publishedRow as unknown[])[0] as any)?.value ?? 0);
    const pendingCount = Number(((pendingRow as unknown[])[0] as any)?.value ?? 0);
    const nextScheduledJob = ((nextJobRow as unknown[])[0] as any)?.value ?? null;

    const recentActivity = (recentRows as unknown[]).map(
      (row: Record<string, unknown>) => {
        const engagement =
          row.engagement && typeof row.engagement === "object"
            ? row.engagement as Record<string, unknown>
            : {};
        const content =
          engagement.content && typeof engagement.content === "object"
            ? engagement.content as Record<string, unknown>
            : typeof row.content === "string"
              ? (() => {
                  try {
                    const parsed = JSON.parse(row.content as string);
                    return parsed && typeof parsed === "object"
                      ? parsed as Record<string, unknown>
                      : {};
                  } catch {
                    return { text: row.content };
                  }
                })()
              : {};
        const platforms = Array.isArray(engagement.platforms)
          ? engagement.platforms.filter((platform): platform is string => typeof platform === "string")
          : [String(row.platform || "social media")];
        const reviewRequired = engagement.reviewRequired === true;
        const receipts = [
          ...(Array.isArray(engagement.postingResults) ? engagement.postingResults : []),
          ...(Array.isArray(engagement.results) ? engagement.results : []),
          ...(Array.isArray(row.engagement) ? row.engagement : []),
        ] as Array<Record<string, unknown>>;
        const confirmed = receipts.some(
          (receipt) =>
            receipt?.outcome === "confirmed" && receipt?.success === true,
        );
        const text = String(content.text ?? content.body ?? content.caption ?? "");
        return {
          status: reviewRequired ? "pending" : confirmed ? "completed" : row.status,
          title: `${reviewRequired ? "Review draft" : "Autopilot post"} on ${platforms.join(", ")}`,
          description: text.length > 180 ? `${text.slice(0, 177)}...` : text,
          time: row.scheduledAt || row.createdAt,
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
        social: {
          trained: socialModel.getIsTrained(),
          version: socialModel.getVersion(),
        },
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get autopilot status:");
    res.status(500).json({ error: "Failed to get autopilot status" });
  }
});

// Start autopilot
router.post("/start", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    let config = await storage.getAutopilotConfig(userId);
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

    await storage.saveAutopilotConfig(userId, config);

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
router.post("/stop", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const config = await storage.getAutopilotConfig(userId);
    if (config) {
      config.enabled = false;
      await storage.saveAutopilotConfig(userId, config);
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
router.post("/configure", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const config = autopilotConfigSchema?.parse(req.body);

    await storage.saveAutopilotConfig(userId, config);

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
router.post("/recommend", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = recommendationRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid recommendation request",
        details: parsed.error.issues,
      });
      return;
    }
    const { contentType, includeMultimodal, platform } = parsed.data;

    let multimodalFeatures = null;
    if (includeMultimodal) {
      const recentAnalyzedContent = await storage.getRecentAnalyzedContent(
        userId,
        10,
      );
      if (recentAnalyzedContent && recentAnalyzedContent?.length > 0) {
        multimodalFeatures = recentAnalyzedContent[0].features;
      }
    }

    const recommendations = await autopilotLearningService.getRecommendations(
      userId,
      {
        platform,
        contentType: contentType ?? "general",
        ...(multimodalFeatures !== null
          ? { extraContext: multimodalFeatures }
          : {}),
      },
    );

    res.json({
      success: true,
      recommendations,
      usedMultimodal: !!multimodalFeatures,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to generate recommendations:");
    if (error instanceof MaxCoreControlError) {
      sendMaxCoreFailure(
        res,
        error,
        "MaxCore recommendations are unavailable",
      );
      return;
    }
    res.status(500).json({ error: "Failed to generate recommendations" });
  }
});

// Predict engagement for content with multimodal features
router.post("/predict-engagement", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = engagementPredictionRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: "Platform and content are required",
        details: parsed.error.issues,
      });
      return;
    }
    const { platform, content, multimodalFeatures } = parsed.data;

    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    const extraContext = {
      contentFeatures: {
        contentLength: content.length,
        hasHashtags: content.includes("#"),
        hasEmojis: emojiRegex.test(content),
        hasLinks: content.includes("http"),
      },
      ...(multimodalFeatures !== undefined ? { multimodalFeatures } : {}),
    };
    const prediction = await aiModelManager.predictEngagement(userId, {
      platform,
      content,
      extraContext,
    });

    res.json({
      success: true,
      prediction,
      usedMultimodal:
        multimodalFeatures !== undefined && multimodalFeatures !== null,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to predict engagement:");
    if (error instanceof MaxCoreControlError) {
      sendMaxCoreFailure(
        res,
        error,
        "MaxCore engagement prediction is unavailable",
      );
      return;
    }
    res.status(500).json({ error: "Failed to predict engagement" });
  }
});

// Save analyzed content features for autopilot training
router.post("/save-features", requireAuth, async (req, res) => {
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

    const featureId = await storage.saveAnalyzedContentFeatures(
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

// MaxCore training is global and storage-backed, so only administrators may
// start it. User-specific measured outcomes are submitted through the learning
// feedback pipeline rather than training a local per-user model.
router.post("/train", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = storageTrainingRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid MaxCore training request",
        details: parsed.error.issues,
      });
      return;
    }

    const trainingResponse = await maxCoreControlTransport.request<unknown>(
      "/training/start-from-storage",
      {
        method: "POST",
        authScope: "admin",
        body: parsed.data,
      },
    );
    const training = validateStorageTrainingResponse(trainingResponse);

    res.status(training.status === "started" ? 202 : 200).json({
      ...training,
      trainingAuthority: "maxcore",
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to train autopilot:");
    if (error instanceof MaxCoreControlError) {
      sendMaxCoreFailure(res, error, "MaxCore training could not be started");
      return;
    }
    res.status(500).json({ error: "Failed to train autopilot AI" });
  }
});

export default router;
