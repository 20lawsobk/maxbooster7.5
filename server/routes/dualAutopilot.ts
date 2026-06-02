import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requirePremium } from "../middleware/requirePremium.js";
import { logger } from "../logger.js";
import { socialFanbaseService } from "../services/socialFanbaseService.js";
import { organicCompoundingService } from "../services/organicCompoundingService.js";
import { bridgeInsightsService } from "../services/bridgeInsightsService.js";
import { db } from "../db.js";
import { fanSegments } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const dailyLoopSchema = z.object({
  date: z.string().datetime().optional(),
});

const createSegmentSchema = z.object({
  name: z.string().min(1).max(255),
  tasteVector: z.object({
    artists: z.array(z.string()).optional(),
    genres: z.array(z.string()).optional(),
    moods: z.array(z.string()).optional(),
  }),
});

const updateSegmentSchema = z.object({
  signals: z.object({
    avgWatchTime: z.number().optional(),
    commentFrequency: z.number().optional(),
    saveRate: z.number().optional(),
    dmIntentScore: z.number().optional(),
  }),
});

const createContentSchema = z.object({
  type: z.string().min(1),
  format: z.string().min(1),
  hookType: z.string().min(1),
  tone: z.string().min(1),
  platform: z.string().min(1),
  trackUsed: z.string().optional(),
  postingTime: z.string().datetime().optional(),
  lengthSeconds: z.number().int().positive().optional(),
});

const updateContentPerformanceSchema = z.object({
  views: z.number().int().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  profileVisits: z.number().int().nonnegative().optional(),
  followerGain: z.number().int().nonnegative().optional(),
  playlistAdds: z.number().int().nonnegative().optional(),
  highIntentDms: z.number().int().nonnegative().optional(),
});

const weeklyLoopSchema = z.object({
  weekStart: z.string().datetime().optional(),
  timeBudgetHours: z.number().positive().default(20),
});

const createAssetSchema = z.object({
  type: z.string().min(1),
  topic: z.string().min(1),
  intent: z.string().min(1),
  creationCostHours: z.number().nonnegative().optional(),
  distributionCost: z.number().nonnegative().optional(),
});

const updateAssetPerformanceSchema = z.object({
  monthlyViews: z.number().int().nonnegative().optional(),
  monthlyClickthrough: z.number().nonnegative().optional(),
  streamingConversions: z.number().int().nonnegative().optional(),
  playlistAdds: z.number().int().nonnegative().optional(),
  emailSignups: z.number().int().nonnegative().optional(),
  revenueGenerated: z.number().nonnegative().optional(),
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1),
  estimatedMonthlyReach: z.number().int().nonnegative().optional(),
  audienceQualityScore: z.number().min(0).max(1).optional(),
});

const updateChannelEfficiencySchema = z.object({
  efficiencyScore: z.number().min(0).max(1),
});

const applyOrganicInsightsSchema = z.object({
  topHooks: z.array(
    z.object({
      hookType: z.string(),
      tone: z.string(),
      format: z.string(),
      avgMusicImpact: z.number(),
    }),
  ),
  topTracksByImpact: z.array(
    z.object({
      trackId: z.string(),
      avgImpact: z.number(),
    }),
  ),
});

const applySocialInsightsSchema = z.object({
  topAssetTypes: z.array(
    z.object({
      type: z.string(),
      avgRoi: z.number(),
    }),
  ),
  topChannels: z.array(
    z.object({
      channelType: z.string(),
      efficiencyScore: z.number(),
    }),
  ),
  highValueIntents: z.array(
    z.object({
      intent: z.string(),
      conversionRate: z.number(),
    }),
  ),
});

router.post(
  "/fanbase/daily-loop",
  requireAuth,
  requirePremium,
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const parsed = dailyLoopSchema.parse(req.body);
      const date = parsed.date ? new Date(parsed.date) : new Date();

      const schedule = await socialFanbaseService.dailySocialLoop(userId, date);

      res.json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Validation error",
            details: error.issues,
          });
      }
      logger.warn({ err: error }, "Error in daily social loop:");
      res
        .status(500)
        .json({ success: false, error: "Failed to run daily social loop" });
    }
  },
);

router.get("/fanbase/music-impact", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    const metrics = await socialFanbaseService.getMusicImpactMetrics(
      userId,
      limit,
    );

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching music impact metrics:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch music impact metrics" });
  }
});

router.post("/fanbase/segments", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = createSegmentSchema.parse(req.body);

    const segment = await socialFanbaseService.createSegment(
      userId,
      parsed.name,
      parsed.tasteVector,
    );

    if (!segment) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to create segment" });
    }

    res.status(201).json({
      success: true,
      data: segment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
    }
    logger.warn({ err: error }, "Error creating fan segment:");
    res
      .status(500)
      .json({ success: false, error: "Failed to create fan segment" });
  }
});

router.get("/fanbase/segments", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const segments = await socialFanbaseService.getFanSegments(userId);

    res.json({
      success: true,
      data: segments,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching fan segments:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch fan segments" });
  }
});

router.put("/fanbase/segments/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const segmentId = req.params.id;
    const [owned] = await db
      .select({ id: fanSegments.id })
      .from(fanSegments)
      .where(and(eq(fanSegments.id, segmentId), eq(fanSegments.userId, userId)))
      .limit(1);
    if (!owned)
      return res
        .status(404)
        .json({ success: false, error: "Segment not found" });
    const parsed = updateSegmentSchema.parse(req.body);

    const segment = await socialFanbaseService.updateSegmentBehavior(
      segmentId,
      parsed.signals,
    );

    if (!segment) {
      return res
        .status(404)
        .json({ success: false, error: "Segment not found" });
    }

    res.json({
      success: true,
      data: segment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
    }
    logger.warn({ err: error }, "Error updating fan segment:");
    res
      .status(500)
      .json({ success: false, error: "Failed to update fan segment" });
  }
});

router.delete("/fanbase/segments/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const segmentId = req.params.id;
    const [owned] = await db
      .select({ id: fanSegments.id })
      .from(fanSegments)
      .where(and(eq(fanSegments.id, segmentId), eq(fanSegments.userId, userId)))
      .limit(1);
    if (!owned)
      return res
        .status(404)
        .json({ success: false, error: "Segment not found" });

    const deleted = await socialFanbaseService.deleteSegment(segmentId);

    if (!deleted) {
      return res
        .status(404)
        .json({
          success: false,
          error: "Segment not found or failed to delete",
        });
    }

    res.json({
      success: true,
      message: "Segment deleted successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error deleting fan segment:");
    res
      .status(500)
      .json({ success: false, error: "Failed to delete fan segment" });
  }
});

router.get("/fanbase/patterns", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const patterns = await socialFanbaseService.getPatternAggregates(userId);

    res.json({
      success: true,
      data: patterns,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching pattern aggregates:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch pattern aggregates" });
  }
});

router.post("/fanbase/content", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = createContentSchema.parse(req.body);

    const content = await socialFanbaseService.createContent(userId, {
      ...parsed,
      postingTime: parsed.postingTime
        ? new Date(parsed.postingTime)
        : undefined,
    });

    if (!content) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to create content" });
    }

    res.status(201).json({
      success: true,
      data: content,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
    }
    logger.warn({ err: error }, "Error creating autopilot content:");
    res
      .status(500)
      .json({ success: false, error: "Failed to create autopilot content" });
  }
});

router.put(
  "/fanbase/content/:id/performance",
  requireAuth,
  async (req, res) => {
    try {
      const contentId = req.params.id;
      const parsed = updateContentPerformanceSchema.parse(req.body);

      const content = await socialFanbaseService.updateContentPerformance(
        contentId,
        parsed,
      );

      if (!content) {
        return res
          .status(404)
          .json({ success: false, error: "Content not found" });
      }

      res.json({
        success: true,
        data: content,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Validation error",
            details: error.issues,
          });
      }
      logger.warn({ err: error }, "Error updating content performance:");
      res
        .status(500)
        .json({
          success: false,
          error: "Failed to update content performance",
        });
    }
  },
);

router.get("/fanbase/content/top", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const content = await socialFanbaseService.getTopPerformingContent(
      userId,
      limit,
    );

    res.json({
      success: true,
      data: content,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching top performing content:");
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to fetch top performing content",
      });
  }
});

router.post(
  "/fanbase/memory/compress",
  requireAuth,
  requirePremium,
  async (req, res) => {
    try {
      const userId = req.user!.id;

      await socialFanbaseService.compressToLongTermMemory(userId);

      res.json({
        success: true,
        message: "Memory compression completed",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error compressing memory:");
      res
        .status(500)
        .json({ success: false, error: "Failed to compress memory" });
    }
  },
);

router.post(
  "/fanbase/memory/decay",
  requireAuth,
  requirePremium,
  async (req, res) => {
    try {
      const userId = req.user!.id;

      await socialFanbaseService.applyTimeDecay(userId);

      res.json({
        success: true,
        message: "Time decay applied successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error applying time decay:");
      res
        .status(500)
        .json({ success: false, error: "Failed to apply time decay" });
    }
  },
);

router.post(
  "/organic/weekly-loop",
  requireAuth,
  requirePremium,
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const parsed = weeklyLoopSchema.parse(req.body);
      const weekStart = parsed.weekStart
        ? new Date(parsed.weekStart)
        : new Date();

      const state = await organicCompoundingService.weeklyOrganicLoop(
        userId,
        weekStart,
        parsed.timeBudgetHours,
      );

      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Validation error",
            details: error.issues,
          });
      }
      logger.warn({ err: error }, "Error in weekly organic loop:");
      res
        .status(500)
        .json({ success: false, error: "Failed to run weekly organic loop" });
    }
  },
);

router.post("/organic/assets", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = createAssetSchema.parse(req.body);

    const asset = await organicCompoundingService.createAsset(userId, {
      id: undefined as Record<string, unknown>,
      ...parsed,
    });

    res.status(201).json({
      success: true,
      data: asset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
    }
    logger.warn({ err: error }, "Error creating organic asset:");
    res
      .status(500)
      .json({ success: false, error: "Failed to create organic asset" });
  }
});

router.get("/organic/assets", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const assets = await organicCompoundingService.getAssets(userId);

    res.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching organic assets:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch organic assets" });
  }
});

router.put("/organic/assets/:id/performance", requireAuth, async (req, res) => {
  try {
    const assetId = req.params.id;
    const parsed = updateAssetPerformanceSchema.parse(req.body);

    const asset = await organicCompoundingService.updateAssetPerformance(
      assetId,
      parsed as Record<string, unknown>,
    );

    if (!asset) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    res.json({
      success: true,
      data: asset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
    }
    logger.warn({ err: error }, "Error updating asset performance:");
    res
      .status(500)
      .json({ success: false, error: "Failed to update asset performance" });
  }
});

router.get("/organic/assets/top", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const assets = await organicCompoundingService.getTopPerformingAssets(
      userId,
      limit,
    );

    res.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching top performing assets:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch top performing assets" });
  }
});

router.post("/organic/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = createChannelSchema.parse(req.body);

    const channel = await organicCompoundingService.createChannel(userId, {
      id: undefined as Record<string, unknown>,
      ...parsed,
    });

    res.status(201).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
    }
    logger.warn({ err: error }, "Error creating organic channel:");
    res
      .status(500)
      .json({ success: false, error: "Failed to create organic channel" });
  }
});

router.get("/organic/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const channels = await organicCompoundingService.getChannels(userId);

    res.json({
      success: true,
      data: channels,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching organic channels:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch organic channels" });
  }
});

router.put(
  "/organic/channels/:id/efficiency",
  requireAuth,
  async (req, res) => {
    try {
      const channelId = req.params.id;
      const parsed = updateChannelEfficiencySchema.parse(req.body);

      const channel = await organicCompoundingService.updateChannelEfficiency(
        channelId,
        parsed.efficiencyScore,
      );

      if (!channel) {
        return res
          .status(404)
          .json({ success: false, error: "Channel not found" });
      }

      res.json({
        success: true,
        data: channel,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Validation error",
            details: error.issues,
          });
      }
      logger.warn({ err: error }, "Error updating channel efficiency:");
      res
        .status(500)
        .json({ success: false, error: "Failed to update channel efficiency" });
    }
  },
);

router.get("/organic/roi/:assetId", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const assetId = req.params.assetId;

    const history = await organicCompoundingService.getRoiHistory(
      userId,
      assetId,
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching ROI history:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch ROI history" });
  }
});

router.get("/organic/lifetime/:assetId", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const assetId = req.params.assetId;

    const stats = await organicCompoundingService.getLifetimeStats(
      userId,
      assetId,
    );

    if (!stats) {
      return res
        .status(404)
        .json({ success: false, error: "Lifetime stats not found" });
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching lifetime stats:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch lifetime stats" });
  }
});

router.get("/organic/compounding-metrics", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const metrics =
      await organicCompoundingService.getCompoundingMetrics(userId);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching compounding metrics:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch compounding metrics" });
  }
});

router.post("/insights/sync", requireAuth, requirePremium, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await bridgeInsightsService.syncInsights(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error syncing insights:");
    res.status(500).json({ success: false, error: "Failed to sync insights" });
  }
});

router.get("/insights/social-to-organic", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const insights = await bridgeInsightsService.getLatestInsights(
      userId,
      "social_to_organic",
    );

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching social-to-organic insights:");
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to fetch social-to-organic insights",
      });
  }
});

router.get("/insights/organic-to-social", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const insights = await bridgeInsightsService.getLatestInsights(
      userId,
      "organic_to_social",
    );

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching organic-to-social insights:");
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to fetch organic-to-social insights",
      });
  }
});

router.get("/insights/summary", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const summary = await bridgeInsightsService.getInsightsSummary(userId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching insights summary:");
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch insights summary" });
  }
});

router.post(
  "/insights/apply/organic",
  requireAuth,
  requirePremium,
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const parsed = applyOrganicInsightsSchema.parse(req.body);

      const result = await bridgeInsightsService.applyInsightsToOrganic(
        userId,
        {
          exportType: "social_to_organic_insights",
          artistId: userId,
          topHooks: parsed.topHooks,
          topTracksByImpact: parsed.topTracksByImpact,
        },
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Validation error",
            details: error.issues,
          });
      }
      logger.warn({ err: error }, "Error applying insights to organic:");
      res
        .status(500)
        .json({ success: false, error: "Failed to apply insights to organic" });
    }
  },
);

router.post(
  "/insights/apply/social",
  requireAuth,
  requirePremium,
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const parsed = applySocialInsightsSchema.parse(req.body);

      const result = await bridgeInsightsService.applyInsightsToSocial(userId, {
        exportType: "organic_to_social_insights",
        artistId: userId,
        topAssetTypes: parsed.topAssetTypes,
        topChannels: parsed.topChannels,
        highValueIntents: parsed.highValueIntents,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Validation error",
            details: error.issues,
          });
      }
      logger.warn({ err: error }, "Error applying insights to social:");
      res
        .status(500)
        .json({ success: false, error: "Failed to apply insights to social" });
    }
  },
);

export default router;
