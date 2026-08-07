import { Router, Request, Response } from "express";
import { requireAuth, requireAuthOnly } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { unifiedAIController } from "../services/unifiedAIController.js";
import { AIUnavailableError } from "../lib/aiSource.js";
import { storage } from "../storage.js";
import { notificationService } from "../services/notificationService.js";
import { pythonAIService } from "../services/pythonAIService.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import { renderVideo as renderAdvancedVideo } from "../services/advancedVideoRendererService.js";
import {
  storeUploadedFile,
  handleUploadError,
  createHardenedUpload,
} from "../middleware/uploadHandler.js";
import { db } from "../db.js";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { adCampaigns, adCreatives, systemSettings } from "@shared/schema";
import { aiModelManager } from "../services/aiModelManager.js";
import { autopilotEngine } from "../autopilot-engine.js";

const imageUpload = createHardenedUpload({
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 1,
  allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  label: "advertising image",
});

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const router = Router();

router.get(
  "/campaigns",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const campaigns = await storage.getAdvertisingCampaigns(userId);
      res.json(campaigns);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get campaigns:");
      res.status(500).json({ error: "Failed to get campaigns" });
    }
  },
);

router.get(
  "/ai-insights",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const insights = await storage.getAdvertisingInsights(userId);
      res.json(insights);
    } catch (error) {
      logger.warn({ err: error }, "Failed to get AI insights:");
      res.status(500).json({ error: "Failed to get AI insights" });
    }
  },
);

router.get(
  "/audience-segments",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const segments = await storage.getAudienceSegments(userId);
      res.json({ segments });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get audience segments:");
      res.status(500).json({ error: "Failed to get audience segments" });
    }
  },
);

router.get(
  "/creative-fatigue",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const creatives = await storage.getCreativeFatigue(userId);
      res.json({ creatives });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get creative fatigue:");
      res.status(500).json({ error: "Failed to get creative fatigue" });
    }
  },
);

router.patch(
  "/creatives/:creativeId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { creativeId } = req.params as Record<string, string>;
      const { action } = req.body as {
        action: "refresh" | "pause" | "resume" | "archive" | string;
      };

      if (
        !action ||
        !["refresh", "pause", "resume", "archive"].includes(action)
      ) {
        return res
          .status(400)
          .json({
            error:
              "Invalid action. Must be one of: refresh, pause, resume, archive",
          });
      }

      const [existing] = await db
        .select()
        .from(adCreatives)
        .where(
          and(eq(adCreatives.id, creativeId), eq(adCreatives.userId, userId)),
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Creative not found" });
      }

      const statusMap: Record<string, string> = {
        refresh: "active",
        pause: "paused",
        resume: "active",
        archive: "archived",
      };

      const newStatus = statusMap[action] ?? existing?.status ?? "active";

      const performanceUpdate =
        action === "refresh"
          ? {
              ...((existing?.performance as Record<string, any>) ?? {}),
              fatigueResetAt: new Date().toISOString(),
            }
          : existing?.performance;

      const [updated] = await db
        .update(adCreatives)
        .set({ status: newStatus, performance: performanceUpdate })
        .where(
          and(eq(adCreatives.id, creativeId), eq(adCreatives.userId, userId)),
        )
        .returning();

      return res.json({
        creative: updated,
        message: `Creative ${action === "refresh" ? "refreshed" : action + "d"} successfully`,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to update creative:");
      return res.status(500).json({ error: "Failed to update creative" });
    }
  },
);

router.get(
  "/bidding-strategies",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const strategies = await storage.getBiddingStrategies(userId);
      res.json({ strategies });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get bidding strategies:");
      res.status(500).json({ error: "Failed to get bidding strategies" });
    }
  },
);

router.get(
  "/lookalike-audiences",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const audiences = await storage.getLookalikeAudiences(userId);
      res.json({ audiences });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get lookalike audiences:");
      res.status(500).json({ error: "Failed to get lookalike audiences" });
    }
  },
);

router.post(
  "/lookalike-audiences",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, sourceAudience, targetPlatforms, estimatedSize, status } =
        req.body;
      if (!name) {
        return res.status(400).json({ error: "Audience name is required" });
      }
      const existing = await storage.getLookalikeAudiences(userId);
      const newAudience = {
        id: `aud_${Date?.now()}`,
        name,
        sourceAudience: sourceAudience || "Custom Audience",
        targetPlatforms: targetPlatforms || [],
        estimatedSize: estimatedSize || 0,
        status: status || "building",
        createdAt: new Date().toISOString(),
      };
      const updated = [...existing, newAudience];
      await db
        .insert(systemSettings)
        .values({
          key: `lookalike_audiences:${userId}`,
          value: updated as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: updated as unknown as Record<string, unknown> },
        });
      res.status(201).json(newAudience);
    } catch (error) {
      logger.warn({ err: error }, "Failed to create lookalike audience:");
      res.status(500).json({ error: "Failed to create lookalike audience" });
    }
  },
);

router.patch(
  "/lookalike-audiences/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;
      const existing = await storage.getLookalikeAudiences(userId);
      const idx = existing?.findIndex(
        (a: Record<string, unknown>) => a?.id === id,
      );
      if (idx === -1) {
        return res.status(404).json({ error: "Audience not found" });
      }
      const { name, sourceAudience, targetPlatforms, estimatedSize, status } =
        req.body;
      existing[idx] = {
        ...existing[idx],
        ...(name !== undefined && { name }),
        ...(sourceAudience !== undefined && { sourceAudience }),
        ...(targetPlatforms !== undefined && { targetPlatforms }),
        ...(estimatedSize !== undefined && { estimatedSize }),
        ...(status !== undefined && { status }),
        id,
      };
      await db
        .insert(systemSettings)
        .values({
          key: `lookalike_audiences:${userId}`,
          value: existing as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: existing as unknown as Record<string, unknown> },
        });
      res.json(existing[idx]);
    } catch (error) {
      logger.warn({ err: error }, "Failed to update lookalike audience:");
      res.status(500).json({ error: "Failed to update lookalike audience" });
    }
  },
);

router.get(
  "/forecasts",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const forecasts = await storage.getAdvertisingForecasts(userId);
      res.json({ forecasts: forecasts ? [forecasts] : [] });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get forecasts:");
      res.status(500).json({ error: "Failed to get forecasts" });
    }
  },
);

router.get(
  "/competitor-insights",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const insights = await storage.getCompetitorInsights(userId);
      res.json({ insights });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get competitor insights:");
      res.status(500).json({ error: "Failed to get competitor insights" });
    }
  },
);

router.get("/ab-tests", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const creatives = await db
      .select()
      .from(adCreatives)
      .where(
        and(eq(adCreatives.userId, userId), isNotNull(adCreatives.variants)),
      )
      .orderBy(desc(adCreatives.createdAt))
      .limit(50);

    const tests = creatives
      .filter(
        (c) =>
          c?.variants &&
          Array.isArray(c?.variants) &&
          (c?.variants as unknown[]).length > 1,
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status || "draft",
        campaignId: c.campaignId,
        variants: c.variants,
        performance: c.performance || null,
        createdAt: c.createdAt,
      }));

    res.json({ tests });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get A/B tests:");
    res.status(500).json({ error: "Failed to get A/B tests" });
  }
});

router.post(
  "/campaigns",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const {
        name,
        platform: platformDirect,
        objective,
        startDate,
        endDate,
        targetAudience,
        creativeIds,
      } = req.body;
      const platform =
        platformDirect ||
        (Array.isArray(targetAudience?.platforms) &&
        targetAudience?.platforms.length > 0
          ? targetAudience?.platforms[0]
          : null);

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Campaign name is required" });
      }
      if (!platform || typeof platform !== "string") {
        return res
          .status(400)
          .json({
            error:
              "Platform is required — select at least one platform in the targeting section",
          });
      }

      const platforms =
        Array.isArray(targetAudience?.platforms) &&
        targetAudience?.platforms.length > 0
          ? targetAudience?.platforms
          : [platform];

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
          status: "active",
        })
        .returning();

      // Kick off AI pipeline in the background — campaign immediately primes MaxCore
      // and ensures content generation is queued for all target platforms
      setImmediate(async () => {
        try {
          await notificationService?.sendAdCampaignCreatedNotification(
            userId,
            name,
          );
        } catch (err) {
          logger.warn({ err: err }, "Ad campaign created notification error:");
        }

        try {
          // Warm up the per-user MaxCore advertising AI model
          const advertisingModel =
            await aiModelManager?.getAdvertisingAutopilot(userId);
          await advertisingModel?.generateCampaignRecommendations(
            objective || "awareness",
            null,
          );
          logger.info(
            { userId, campaignId: campaign.id },
            "MaxCore ad model primed for new campaign",
          );
        } catch (err) {
          logger.warn({ err }, "MaxCore ad model priming error (non-fatal):");
        }

        try {
          // Configure the autopilot engine with this campaign's targeting and start content scheduling
          const engineConfig = await autopilotEngine.getConfig();
          await autopilotEngine.configure({
            ...engineConfig,
            platforms: platforms.map((p: string) => p.toLowerCase()),
            campaignObjective:
              (objective as Record<string, unknown>) || "awareness",
          });
          // Start the engine if not already running so it schedules the first content generation
          const status = await autopilotEngine.getStatus();
          if (!status.isRunning) {
            await autopilotEngine.start();
            logger.info(
              { userId, campaignId: campaign.id },
              "Autopilot engine started for new campaign",
            );
          }
        } catch (err) {
          logger.warn({ err }, "Autopilot engine start error (non-fatal):");
        }
      });

      res.status(201).json({ success: true, campaign });
    } catch (error) {
      logger.warn({ err: error }, "Failed to create campaign:");
      res.status(500).json({ error: "Failed to create campaign" });
    }
  },
);

router.post(
  "/upload-image",
  requireAuth,
  imageUpload.single("image"),
  handleUploadError,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({
            error:
              'Image file required. Send as multipart/form-data with field name "image".',
          });
      }
      const { url, key } = await storeUploadedFile(file, userId, "images");
      res.json({ success: true, url, key });
    } catch (error) {
      logger.warn({ err: error }, "Failed to upload ad image:");
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

// Platform CPM benchmarks (industry paid-ad rates) — used to compute organic ad-equivalent value
const PLATFORM_CPM: Record<string, number> = {
  instagram: 8.5, tiktok: 6.2, youtube: 11.4, twitter: 7.8,
  facebook: 9.1, linkedin: 14.0, threads: 6.5, spotify: 12.0,
};
function adEquivalentValue(platform: string, organicReach: number): number {
  const cpm = PLATFORM_CPM[platform] ?? 8.0;
  return (organicReach / 1000) * cpm;
}

// Advertising autopilot status — returns isRunning, config, modelStatus + campaign organic metrics
router.get("/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [campaigns, autopilotConfig] = await Promise?.all([
      db
        .select({
          platform: adCampaigns.platform,
          status: adCampaigns.status,
          performance: adCampaigns.performance,
        })
        .from(adCampaigns)
        .where(eq(adCampaigns.userId, userId))
        .limit(100),
      storage.getAdvertisingAutopilotConfig(userId),
    ]);

    const activeCampaigns = campaigns?.filter((c) => c?.status === "active");
    const connectedPlatforms = [
      ...new Set(activeCampaigns?.map((c) => c?.platform)),
    ];
    const totalOrganicReach = campaigns?.reduce((sum, c) => {
      const perf = (c?.performance || {}) as Record<string, unknown>;
      return sum + Number(perf?.organicReach || perf?.reach || 0);
    }, 0);
    const estimatedAdEquivalent = campaigns?.reduce((sum, c) => {
      const perf = (c?.performance || {}) as Record<string, unknown>;
      const reach = Number(perf?.organicReach || perf?.reach || 0);
      return sum + adEquivalentValue(c?.platform, reach);
    }, 0);

    res.json({
      isRunning: autopilotConfig?.isRunning || false,
      config: autopilotConfig || null,
      status: {
        campaignStatus: activeCampaigns.length > 0 ? "active" : "inactive",
        connectedPlatforms,
        activeCampaigns: activeCampaigns.length,
        totalOrganicReach,
        estimatedAdEquivalent: Math.round(estimatedAdEquivalent * 100) / 100,
        adSpend: 0,
      },
      modelStatus: {
        advertising: { trained: false, version: "1.0.0" },
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get advertising status:");
    res.status(500).json({ error: "Failed to get status" });
  }
});

// Start advertising autopilot
router.post("/start", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    let config = await storage.getAdvertisingAutopilotConfig(userId);
    config = { ...(config || {}), isRunning: true, enabled: true };
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    logger.info(`✅ Advertising autopilot started for user ${userId}`);
    res.json({
      success: true,
      message: "Advertising autopilot activated",
      config,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to start advertising autopilot:");
    res.status(500).json({ error: "Failed to start advertising autopilot" });
  }
});

// Stop advertising autopilot
router.post("/stop", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    let config = await storage.getAdvertisingAutopilotConfig(userId);
    config = { ...(config || {}), isRunning: false, enabled: false };
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    logger.info(`⏸️ Advertising autopilot paused for user ${userId}`);
    res.json({ success: true, message: "Advertising autopilot paused" });
  } catch (error) {
    logger.warn({ err: error }, "Failed to stop advertising autopilot:");
    res.status(500).json({ error: "Failed to stop advertising autopilot" });
  }
});

// Configure advertising autopilot
router.post(
  "/configure",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const existing = await storage.getAdvertisingAutopilotConfig(userId);
      // Extract only known autopilot config fields — never spread the entire body.
      const {
        enabled,
        platforms,
        campaignObjective,
        campaignFrequency,
        brandVoice,
        contentTypes,
        mediaTypes,
        targetAudience,
        ageMin,
        ageMax,
        interests,
        locations,
        budgetOptimization,
        dailyBudgetLimit,
        viralOptimization,
        algorithmicTargeting,
        autoPublish,
        optimalTimesOnly,
        crossPlatformCampaigns,
        engagementThreshold,
        minConfidenceThreshold,
        autoAnalyzeBeforePosting,
      } = req.body;
      const patch = Object.fromEntries(
        Object.entries({
          enabled,
          platforms,
          campaignObjective,
          campaignFrequency,
          brandVoice,
          contentTypes,
          mediaTypes,
          targetAudience,
          ageMin,
          ageMax,
          interests,
          locations,
          budgetOptimization,
          dailyBudgetLimit,
          viralOptimization,
          algorithmicTargeting,
          autoPublish,
          optimalTimesOnly,
          crossPlatformCampaigns,
          engagementThreshold,
          minConfidenceThreshold,
          autoAnalyzeBeforePosting,
        }).filter(([, v]) => v !== undefined),
      );
      const config = { ...(existing || {}), ...patch };
      await storage.saveAdvertisingAutopilotConfig(userId, config);
      logger.info(`⚙️ Advertising autopilot configured for user ${userId}`);
      res.json({
        success: true,
        message: "Advertising autopilot configuration updated",
        config,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to configure advertising autopilot:");
      res
        .status(500)
        .json({ error: "Failed to configure advertising autopilot" });
    }
  },
);

// Variants endpoint
router.get("/variants", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const creatives = await db
      .select()
      .from(adCreatives)
      .where(eq(adCreatives.userId, userId))
      .orderBy(desc(adCreatives.createdAt))
      .limit(100);

    const variants = creatives?.flatMap((c) => {
      if (!c?.variants || !Array.isArray(c?.variants)) return [];
      return (c?.variants as Record<string, unknown>[]).map(
        (v: Record<string, unknown>, idx: number) => ({
          id: `${c?.id}-v${idx}`,
          creativeId: c.id,
          creativeName: c.name,
          variantIndex: idx,
          ...v,
        }),
      );
    });

    res.json({ variants });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get variants:");
    res.status(500).json({ error: "Failed to get variants" });
  }
});

// Attribution endpoints — derive from campaign data
router.get(
  "/attribution/channels",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const campaigns = await db
        .select({
          platform: adCampaigns.platform,
          budget: adCampaigns.budget,
          status: adCampaigns.status,
          performance: adCampaigns.performance,
        })
        .from(adCampaigns)
        .where(eq(adCampaigns.userId, userId))
        .limit(200);

      const channelMap = new Map<
        string,
        {
          organicReach: number;
          conversions: number;
          engagements: number;
          campaigns: number;
        }
      >();
      for (const c of campaigns) {
        const perf = (c?.performance || {}) as Record<string, unknown>;
        const entry = channelMap?.get(c?.platform) || {
          organicReach: 0,
          conversions: 0,
          engagements: 0,
          campaigns: 0,
        };
        entry.organicReach += Number(perf?.organicReach || perf?.reach || 0);
        entry.conversions += Number(perf?.conversions || 0);
        entry.engagements += Number(perf?.engagements || perf?.likes || 0);
        entry.campaigns += 1;
        channelMap?.set(c?.platform, entry);
      }

      const channels = Array.from(channelMap?.entries()).map(
        ([platform, data]) => ({
          platform,
          organicReach: data.organicReach,
          conversions: data.conversions,
          engagements: data.engagements,
          campaigns: data.campaigns,
          adEquivalentValue: Math.round(adEquivalentValue(platform, data.organicReach) * 100) / 100,
          adSpend: 0,
        }),
      );

      res.json({ channels });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get attribution channels:");
      res.status(500).json({ error: "Failed to get attribution channels" });
    }
  },
);

router.get(
  "/attribution/paths",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const campaigns = await db
        .select({
          platform: adCampaigns.platform,
          objective: adCampaigns.objective,
          performance: adCampaigns.performance,
        })
        .from(adCampaigns)
        .where(
          and(
            eq(adCampaigns.userId, userId),
            isNotNull(adCampaigns.performance),
          ),
        )
        .limit(100);

      const paths = campaigns
        .filter(
          (c) => (c?.performance as Record<string, unknown>)?.conversions > 0,
        )
        .map((c) => ({
          path: [c?.platform, c?.objective || "conversion"].filter(Boolean),
          conversions:
            (c?.performance as Record<string, unknown>)?.conversions || 0,
          revenue: (c?.performance as Record<string, unknown>)?.revenue || 0,
        }));

      res.json({ paths });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get attribution paths:");
      res.status(500).json({ error: "Failed to get attribution paths" });
    }
  },
);

// Dashboard endpoints
router.get(
  "/dashboard/attribution",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const campaigns = await db
        .select({
          platform: adCampaigns.platform,
          performance: adCampaigns.performance,
        })
        .from(adCampaigns)
        .where(eq(adCampaigns.userId, userId))
        .limit(200);

      const channelMap = new Map<string, number>();
      let total = 0;
      for (const c of campaigns) {
        const perf = (c?.performance || {}) as Record<string, unknown>;
        const reach = Number(perf?.organicReach || perf?.reach || 0);
        const rev = Number(perf?.revenue || adEquivalentValue(c?.platform, reach));
        channelMap?.set(c?.platform, (channelMap?.get(c?.platform) || 0) + rev);
        total += rev;
      }

      const channels = Array.from(channelMap?.entries()).map(
        ([platform, revenue]) => ({
          platform,
          revenue,
          share: total > 0 ? revenue / total : 0,
        }),
      );

      res.json({ attribution: { channels, total } });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get dashboard attribution:");
      res.status(500).json({ error: "Failed to get dashboard attribution" });
    }
  },
);

router.get(
  "/dashboard/paths",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const campaigns = await db
        .select({
          platform: adCampaigns.platform,
          objective: adCampaigns.objective,
          performance: adCampaigns.performance,
          status: adCampaigns.status,
        })
        .from(adCampaigns)
        .where(eq(adCampaigns.userId, userId))
        .limit(100);

      const paths = campaigns
        .filter((c) => c?.status === "active" || c?.status === "completed")
        .map((c) => ({
          channel: c.platform,
          objective: c.objective,
          conversions:
            (c?.performance as Record<string, unknown>)?.conversions || 0,
        }));

      res.json({ paths });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get dashboard paths:");
      res.status(500).json({ error: "Failed to get dashboard paths" });
    }
  },
);

// ROAS endpoints
router.get(
  "/roas/audience-segments",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const campaigns = await db
        .select({
          id: adCampaigns.id,
          name: adCampaigns.name,
          targetAudience: adCampaigns.targetAudience,
          budget: adCampaigns.budget,
          performance: adCampaigns.performance,
        })
        .from(adCampaigns)
        .where(
          and(
            eq(adCampaigns.userId, userId),
            isNotNull(adCampaigns.targetAudience),
          ),
        )
        .limit(50);

      const segments = campaigns?.map((c) => {
        const perf = (c?.performance || {}) as Record<string, unknown>;
        const reach = Number(perf?.organicReach || perf?.reach || 0);
        const engagements = Number(perf?.engagements || perf?.likes || 0);
        const engagementRate = reach > 0 ? (engagements / reach) * 100 : 0;
        return {
          campaignId: c.id,
          campaignName: c.name,
          audience: c.targetAudience,
          organicReach: reach,
          engagements,
          engagementRate: Math.round(engagementRate * 100) / 100,
          adEquivalentValue: Math.round(adEquivalentValue((c as any)?.platform || "instagram", reach) * 100) / 100,
          adSpend: 0,
        };
      });

      res.json({ segments });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get ROAS audience segments:");
      res.status(500).json({ error: "Failed to get ROAS audience segments" });
    }
  },
);

router.get(
  "/roas/campaigns",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
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
      logger.warn({ err: error }, "Failed to get ROAS campaigns:");
      res.status(500).json({ error: "Failed to get ROAS campaigns" });
    }
  },
);

router.get(
  "/roas/creative-fatigue-analysis",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const creatives = await db
        .select()
        .from(adCreatives)
        .where(eq(adCreatives.userId, userId))
        .orderBy(desc(adCreatives.createdAt))
        .limit(100);

      const fatigued: Record<string, unknown>[] = [];
      const healthy: Record<string, unknown>[] = [];

      for (const c of creatives) {
        const perf = (c?.performance || {}) as Record<string, unknown>;
        const ctr = Number(perf?.ctr || 0);
        const impressions = Number(perf?.impressions || 0);
        const age = c?.createdAt
          ? Math.floor(
              (Date?.now() - new Date(c?.createdAt).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : 0;

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
          fatigueScore: isFatigued
            ? Math.min(100, age + (impressions > 10000 ? 30 : 0))
            : Math.max(0, age / 2),
        };

        if (isFatigued) {
          fatigued?.push(item);
        } else {
          healthy?.push(item);
        }
      }

      res.json({ analysis: { fatigued, healthy } });
    } catch (error) {
      logger.warn(
        { err: error },
        "Failed to get ROAS creative fatigue analysis:",
      );
      res
        .status(500)
        .json({ error: "Failed to get ROAS creative fatigue analysis" });
    }
  },
);

router.get(
  "/roas/forecast",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const campaigns = await db
        .select({
          budget: adCampaigns.budget,
          dailyBudget: adCampaigns.dailyBudget,
          performance: adCampaigns.performance,
          status: adCampaigns.status,
        })
        .from(adCampaigns)
        .where(
          and(eq(adCampaigns.userId, userId), eq(adCampaigns.status, "active")),
        )
        .limit(100);

      // Organic reach projection — based on historical performance, grows with active campaigns
      const baselineDailyReach = campaigns?.reduce((sum, c) => {
        const perf = (c?.performance || {}) as Record<string, unknown>;
        const totalReach = Number(perf?.organicReach || perf?.reach || 1000);
        return sum + Math.round(totalReach / 30);
      }, 500 * campaigns.length);

      const avgPlatformCpm = campaigns.length > 0
        ? campaigns.reduce((sum, c) => sum + (PLATFORM_CPM[(c as any)?.platform] ?? 8.0), 0) / campaigns.length
        : 8.0;

      const daily = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date?.setDate(date?.getDate() + i + 1);
        const growthFactor = 1 + (i * 0.04);
        const jitter = 0.9 + Math.random() * 0.2;
        const projectedReach = Math.round(baselineDailyReach * growthFactor * jitter);
        const adEquiv = Math.round((projectedReach / 1000) * avgPlatformCpm * 100) / 100;
        return {
          date: date.toISOString().split("T")[0],
          projectedOrganicReach: projectedReach,
          estimatedAdEquivalent: adEquiv,
          adSpend: 0,
        };
      });

      const weekly = Array.from({ length: 4 }, (_, i) => {
        const projectedReach = Math.round(baselineDailyReach * 7 * (1 + i * 0.06));
        const adEquiv = Math.round((projectedReach / 1000) * avgPlatformCpm * 100) / 100;
        return { week: i + 1, projectedOrganicReach: projectedReach, estimatedAdEquivalent: adEquiv, adSpend: 0 };
      });

      const monthly = Array.from({ length: 3 }, (_, i) => {
        const projectedReach = Math.round(baselineDailyReach * 30 * (1 + i * 0.08));
        const adEquiv = Math.round((projectedReach / 1000) * avgPlatformCpm * 100) / 100;
        return { month: i + 1, projectedOrganicReach: projectedReach, estimatedAdEquivalent: adEquiv, adSpend: 0 };
      });

      res.json({
        forecast: {
          daily,
          weekly,
          monthly,
          activeCampaigns: campaigns.length,
          methodology: "organic_amplification",
          adSpend: 0,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to get ROAS forecast:");
      res.status(500).json({ error: "Failed to get ROAS forecast" });
    }
  },
);

// AI-powered campaign optimization
router.post("/optimize-campaign", requireAuth, async (req, res) => {
  try {
    const { campaignId, performance } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: "Campaign ID is required" });
    }

    // Build campaign object for MaxCore organic-amplification optimization
    // All metrics are organic (no ad spend — adSpend is always 0)
    const platform = performance.platform || "instagram";
    const organicReach = performance.organicReach || performance.impressions || 1000;
    const campaign = {
      id: campaignId,
      name: performance.name || "Campaign",
      platform,
      objective: performance.objective || "engagement",
      status: "active" as const,
      budget: 0,
      dailyBudget: 0,
      startDate: new Date(),
      targeting: {
        ageMin: 18,
        ageMax: 44,
        genders: ["male", "female"] as ("male" | "female")[],
        locations: ["US"],
        interests: ["music"],
        behaviors: [],
        customAudiences: [],
        lookalikes: [],
        excludedAudiences: [],
      },
      creatives: [
        {
          id: "c1",
          type: "image" as const,
          headline: "Check it out",
          body: "New content",
          callToAction: "Learn More",
        },
      ],
      metrics: {
        organicReach,
        impressions: organicReach,
        clicks: performance.clicks || Math.round(organicReach * 0.05),
        conversions: performance.conversions || Math.round(organicReach * 0.005),
        engagements: performance.engagements || Math.round(organicReach * 0.08),
        adSpend: 0,
        adEquivalentValue: adEquivalentValue(platform, organicReach),
        ctr: performance.ctr || 0.05,
        engagementRate: performance.engagementRate || 0.08,
        viralScore: performance.viralScore || 0,
      },
    };

    const result = await unifiedAIController?.optimizeAd({
      campaign,
      action: "score",
    });

    if (!result?.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      campaignId,
      optimization: result.data,
      recommendations: (result.data as any)?.recommendations || [],
    });

    const userId = (req as AuthenticatedRequest).user?.id;
    if (userId) {
      setImmediate(async () => {
        try {
          const campaignName = performance?.name || `Campaign ${campaignId}`;
          const topRec =
            ((result?.data as any)?.recommendations as string[] | undefined)?.[0] ||
            "Review your targeting and creatives for better performance.";
          await notificationService?.sendAdCampaignOptimizedNotification(
            userId,
            campaignName,
            topRec,
          );
        } catch (err) {
          logger.warn(
            { err: err },
            "Ad campaign optimized notification error:",
          );
        }
      });
    }
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.warn({ err: error }, "Failed to optimize campaign:");
    res.status(500).json({ error: "Failed to optimize campaign" });
  }
});

// AI-powered content generation for ads
router.post("/generate-content", requireAuthOnly, async (req, res) => {
  try {
    const {
      campaignId,
      contentType = "promotional",
      platform = "instagram",
      topic = "new music release",
      tone = "energetic",
    } = req.body;

    const validPlatforms = [
      "instagram",
      "twitter",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
    ];
    const validTones = ["professional", "casual", "energetic", "promotional"];

    const result = await unifiedAIController?.generateContent({
      tone: validTones.includes(tone) ? tone : "energetic",
      platform: validPlatforms.includes(platform) ? platform : "instagram",
      topic: topic || "new music",
      contentType: contentType === "ad_copy" ? "promotional" : contentType,
      includeHashtags: true,
      includeEmojis: true,
    });

    if (!result?.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      campaignId,
      content: result.data,
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, error: error.message });
    }
    logger.warn({ err: error }, "Failed to generate ad content:");
    res.status(500).json({ error: "Failed to generate content" });
  }
});

router.post(
  "/generate-video",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        topic,
        platform,
        template,
        aspect_ratio,
        duration,
        tone,
        goal,
        artist_name,
        quality,
      } = req.body;

      // Route through the Advanced Video Renderer (MaxCore → Python AI → FFmpeg)
      const result = await renderAdvancedVideo({
        topic: topic || "music promotion",
        platform: platform || "instagram",
        template: template || "cinematic_promo",
        aspect_ratio,
        duration: duration || 10,
        tone: tone || "energetic",
        goal: goal || "growth",
        artist_name,
        quality: quality || "cinematic",
      });

      if (!result?.success) {
        return res
          .status(500)
          .json({
            success: false,
            message: result.error || "Video generation failed",
          });
      }

      logger.info(
        `[AdVideoGen] Video ready via ${result?.source || "renderer"}`,
      );
      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Failed to generate ad video:");
      res
        .status(500)
        .json({ success: false, message: "Video generation failed" });
    }
  },
);

router.post(
  "/generate-image",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { topic, platform, tone, goal, artist_name, style } = req.body;

      if (!topic) {
        return res
          .status(400)
          .json({ success: false, message: "Topic is required" });
      }

      // ── Tier 1: MaxCore (sole AI source) ─────────────────────────────────────
      type McImageResp = {
        url?: string;
        image_url?: string;
        width?: number;
        height?: number;
        format?: string;
        prompt_used?: string;
      };
      let mcImageData: McImageResp | null = null;
      try {
        mcImageData = await MaxCoreAIClient?.infer<McImageResp>(
          "/api/generate/image",
          {
            topic,
            platform: platform || "instagram",
            tone: tone || "energetic",
            goal: goal || "growth",
            artist_name,
            style: style || "modern",
          },
        );
      } catch (err) {
        // Propagate 503 so callers know MaxCore is down, not just "no image"
        if (err instanceof AIUnavailableError) throw err;
        mcImageData = null;
      }

      if (mcImageData?.url || mcImageData?.image_url) {
        return res.json({ success: true, ...mcImageData });
      }

      // MaxCore is the sole image generation source — no Python AI fallback.
      // Return a structured visual spec so the caller can render a placeholder
      // until the next MaxCore request succeeds.
      return res.json({
        success: false,
        image_url: null,
        visual_spec: {
          topic,
          platform: platform || "instagram",
          tone: tone || "energetic",
          goal: goal || "growth",
          artist_name: artist_name || "",
          style: style || "modern",
        },
        message:
          "MaxCore image generation temporarily unavailable — retry shortly",
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(error.statusCode).json({ success: false, code: error.code, error: error.message });
      }
      logger.warn({ err: error }, "Failed to generate ad image:");
      res
        .status(500)
        .json({ success: false, message: "Image generation failed" });
    }
  },
);

router.get(
  "/video-templates",
  requireAuthOnly,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await pythonAIService?.getCinematicTemplates();
      if (result?.success && result?.data) {
        res.json(result?.data);
      } else {
        res.json({
          templates: [
            {
              id: "cinematic_promo",
              name: "Cinematic Promo",
              description: "Film-quality promotional video",
              category: "promo",
            },
            {
              id: "neon_pulse",
              name: "Neon Pulse",
              description: "Vibrant neon with plasma backgrounds",
              category: "energetic",
            },
            {
              id: "dark_cinema",
              name: "Dark Cinema",
              description: "Moody atmospheric film look",
              category: "dramatic",
            },
            {
              id: "music_video",
              name: "Music Video",
              description: "High-energy music video style",
              category: "music",
            },
            {
              id: "gold_luxury",
              name: "Gold Luxury",
              description: "Premium gold and black aesthetic",
              category: "luxury",
            },
            {
              id: "elegant_minimal",
              name: "Elegant Minimal",
              description: "Clean sophisticated design",
              category: "professional",
            },
          ],
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Failed to get ad video templates:");
      res
        .status(500)
        .json({ success: false, message: "Failed to get templates" });
    }
  },
);

export default router;
