// @ts-nocheck
import { Router, Request, Response } from "express";
import { requireAuth, requireAuthOnly } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { AIUnavailableError, requireMaxCore } from "../lib/aiSource.js";
import { storage } from "../storage.js";
import { notificationService } from "../services/notificationService.js";
import { pythonAIService } from "../services/pythonAIService.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import { storageService } from "../services/storageService.js";
import {
  getMaxcoreGenerationHeaders,
  getMaxcoreOrigin,
  isAllowedMaxcoreMediaPath,
} from "../services/maxcoreConnector.js";
import { renderVideo as renderAdvancedVideo } from "../services/advancedVideoRendererService.js";
import {
  storeUploadedFile,
  handleUploadError,
  createHardenedUpload,
} from "../middleware/uploadHandler.js";
import { db } from "../db.js";
import { eq, desc, and, isNotNull, inArray } from "drizzle-orm";
import { adCampaigns, adCreatives, systemSettings } from "@shared/schema";
import { aiModelManager } from "../services/aiModelManager.js";
import { advertisingDispatchService } from "../services/advertisingDispatchService.js";
import {
  PROMOTABLE_CONTENT_TYPES,
  PromotableContentError,
  resolvePromotableContent,
} from "../services/promotableContentService.js";

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

/**
 * Keep the payloads at this boundary identical to MaxCore's documented
 * contracts.  In particular, /api/optimize/ad is not the ads-platform
 * endpoint and expects the campaign under `campaign`, not an envelope.
 */
export function buildAdOptimizationRequest(campaign: unknown) {
  return { action: "score", campaign };
}

export function buildAdGenerationRequest(
  userId: string,
  source: {
    title: string;
    artist: string;
    description: string;
    category: string;
    artworkUrl: string;
    sourceUrl: string;
    sourcePlatform: string;
    contentType: string;
  },
  options: {
    platform?: string;
    goal?: string;
    adType?: string;
    instruction?: string;
    contentThemes?: string[];
  } = {},
) {
  const sourceContext = [
    `Selected ${source.contentType}: ${source.title}`,
    source.description,
    `Owned source: ${source.sourcePlatform} (${source.sourceUrl})`,
    source.artworkUrl ? `Artwork: ${source.artworkUrl}` : "",
    options.instruction?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    user_id: userId,
    product: source.title,
    artist_name: source.artist || undefined,
    platform: options.platform || "instagram",
    goal: options.goal || "streams",
    ad_type: options.adType || "video",
    genre: source.category || undefined,
    instruction: sourceContext,
    content_themes: options.contentThemes?.length
      ? options.contentThemes
      : [source.contentType, source.title].filter(Boolean),
  };
}

export function buildImageGenerationRequest(input: {
  prompt: string;
  slots?: unknown;
  intent?: string;
  platform?: string;
  style?: string;
  aspect_ratio?: string;
  tone?: string;
  goal?: string;
  artist_name?: string;
}) {
  const platformAliases: Record<string, string> = {
    "google business": "google_business",
    googlebusiness: "google_business",
    "google-business": "google_business",
    twitter: "x",
    "twitter/x": "x",
  };
  const supportedPlatforms = new Set([
    "facebook",
    "instagram",
    "youtube",
    "tiktok",
    "threads",
    "google_business",
    "x",
    "linkedin",
  ]);
  const rawPlatform = String(input.platform || "").trim().toLowerCase();
  const normalizedPlatform =
    platformAliases[rawPlatform] ||
    rawPlatform.replace(/\s+/g, "_") ||
    "instagram";
  const platform = supportedPlatforms.has(normalizedPlatform)
    ? normalizedPlatform
    : "instagram";
  const purpose =
    input.intent?.trim() || input.goal?.trim() || "promotional";
  const slots =
    input.slots ?? [{ id: "advertising-hero", platform, purpose }];
  const context = [
    input.tone?.trim() ? `Tone: ${input.tone.trim()}` : "",
    input.goal?.trim() ? `Goal: ${input.goal.trim()}` : "",
    input.artist_name?.trim() ? `Artist: ${input.artist_name.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prompt: input.prompt,
    slots,
    intent: purpose,
    ...(input.style ? { style: input.style } : {}),
    ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
    ...(context ? { instruction: context } : {}),
    ...(input.tone ? { mood: input.tone } : {}),
    ...(context
      ? {
          content_themes: [input.tone, input.goal, input.artist_name].filter(
            (value): value is string => !!value?.trim(),
          ),
        }
      : {}),
  };
}

function imageMagic(buffer: Buffer): boolean {
  return (
    (buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47) ||
    (buffer.length > 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) ||
    (buffer.length > 12 &&
      buffer.slice(8, 12).toString("ascii") === "WEBP") ||
    (buffer.length > 6 && buffer.slice(0, 4).toString("ascii") === "GIF8")
  );
}

/**
 * MaxCore image responses point at /uploads/images on the AI service. Resolve
 * only that service's allowed media path, validate the bytes, and immediately
 * put the result in PDIM. No local uploads directory is used or returned.
 *
 * The optional dependencies make this boundary directly behavior-testable
 * without starting a server or contacting MaxCore.
 */
export async function mirrorGeneratedImageToPDIM(
  rawUrl: string,
  deps: {
    fetchImpl?: typeof fetch;
    storage?: typeof storageService;
  } = {},
): Promise<string> {
  const origin = getMaxcoreOrigin();
  const fetchImpl = deps.fetchImpl || fetch;
  const pdim = deps.storage || storageService;
  let remote: URL;
  try {
    remote = new URL(rawUrl, origin);
  } catch {
    throw new Error("MaxCore image URL is invalid");
  }

  if (
    !origin ||
    remote.origin !== new URL(origin).origin ||
    !isAllowedMaxcoreMediaPath(remote.pathname) ||
    !/^\/uploads\/images\//i.test(remote.pathname)
  ) {
    throw new Error("MaxCore image URL is not an allowed /uploads/images asset");
  }

  const response = await fetchImpl(remote.toString(), {
    headers: getMaxcoreGenerationHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`MaxCore image download failed (${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 10 * 1024 * 1024) {
    throw new Error("MaxCore image exceeds the 10 MB limit");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024 || !imageMagic(bytes)) {
    throw new Error("MaxCore image response is not a valid image");
  }

  const basename =
    remote.pathname.split("/").pop()?.replace(/[^A-Za-z0-9._-]/g, "_") ||
    "generated.png";
  const contentType =
    response.headers.get("content-type")?.split(";")[0] || "image/png";
  const key = await pdim.uploadFile(bytes, "images", basename, contentType);
  return pdim.getDownloadUrl(key);
}

/**
 * MaxCore's content composer has returned a few valid shapes over time
 * (caption-only, hook/body/cta, or those fields nested under `data`).  Keep
 * response normalization here, at the advertisement route boundary, so a
 * valid caption is not rejected merely because MaxCore omitted optional
 * fields.  A structurally empty response remains unavailable and is never
 * presented as generated content.
 */
export function normalizeAdContent(result: unknown): unknown | null {
  let candidate: unknown =
    result && typeof result === "object" && "data" in result
      ? (result as { data?: unknown }).data
      : result;

  // Accommodate the occasional { data: { content: { ... } } } envelope
  // without accepting arbitrary metadata as generated copy.
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== "object") break;
    const record = candidate as Record<string, unknown>;
    if ("content" in record) {
      candidate = record.content;
      continue;
    }
    if (
      "data" in record &&
      !["caption", "hook", "body", "cta"].some(
        (field) => typeof record[field] === "string" && record[field]?.trim(),
      )
    ) {
      candidate = record.data;
    }
    break;
  }

  if (typeof candidate === "string") {
    return candidate.trim() ? candidate : null;
  }
  if (!candidate || typeof candidate !== "object") return null;

  const content = candidate as Record<string, unknown>;
  const hasUsableCopy = ["caption", "hook", "body", "cta"].some(
    (field) => typeof content[field] === "string" && content[field].trim(),
  );
  return hasUsableCopy ? content : null;
}

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
      const campaigns = await storage.getAdvertisingCampaigns(userId);
      // This product dispatches organic posts only. A campaign's configured
      // budget is a planning limit, not money charged or spent, so it must
      // never be reported as actual spend.
      res.json({
        totalCampaigns: campaigns.length,
        totalSpend: 0,
        plannedBudget: campaigns.reduce(
          (total, campaign) => total + Number(campaign.budget ?? 0),
          0,
        ),
        activeCampaigns: campaigns.filter(
          (campaign) => campaign.status === "active",
        ).length,
      });
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
        id: `aud_${Date.now()}`,
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
      .where(eq(adCreatives.userId, userId))
      .orderBy(desc(adCreatives.createdAt))
      .limit(100);

    // A campaign with two or more attached creatives is an A/B test.  The
    // campaign builder previously persisted that relationship only in
    // ad_campaigns.creative_ids, while this endpoint looked exclusively for a
    // legacy JSON variants field, so legitimate tests never appeared.
    const groups = new Map<string, typeof creatives>();
    for (const creative of creatives) {
      if (!creative.campaignId) continue;
      const group = groups.get(creative.campaignId) ?? [];
      group.push(creative);
      groups.set(creative.campaignId, group);
    }

    const normalizeVariant = (creative: (typeof creatives)[number]) => {
      const performance =
        (creative.performance as Record<string, unknown> | null) ?? {};
      const impressions = Number(performance.impressions ?? 0);
      const clicks = Number(performance.clicks ?? 0);
      const conversions = Number(performance.conversions ?? 0);
      return {
        id: creative.id,
        name: creative.name,
        headline: creative.headline ?? "",
        description: creative.description ?? "",
        cta: creative.callToAction ?? "",
        imageUrl: creative.thumbnailUrl ?? creative.mediaUrl ?? undefined,
        status: creative.status ?? "draft",
        impressions,
        clicks,
        conversions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
        confidence: 0,
        predictionScore: 0,
        aiScore: 0,
        revenue: Number(performance.revenue ?? 0),
        createdAt: creative.createdAt,
      };
    };

    const tests = Array.from(groups.entries())
      .filter(([, variants]) => variants.length > 1)
      .map(([campaignId, variants]) => {
        const normalized = variants.map(normalizeVariant);
        const sampleSize = normalized.reduce(
          (total, variant) => total + variant.impressions,
          0,
        );
        return {
          id: campaignId,
          campaignId,
          name: `Campaign creative test`,
          status: variants.some((variant) => variant.status === "active")
            ? "running"
            : "draft",
          startDate: variants
            .map((variant) => variant.createdAt)
            .filter(Boolean)
            .sort()[0] ?? null,
          variants: normalized,
          statisticalSignificance: 0,
          sampleSize,
          targetSampleSize: 0,
        };
      });

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
        creativeMediaUrl,
        duration,
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
      if (
        !platforms.every(
          (candidate) =>
            typeof candidate === "string" && candidate.trim().length > 0,
        )
      ) {
        return res.status(400).json({ error: "All target platforms must be valid strings" });
      }
      const normalizedPlatforms = [
        ...new Set(platforms.map((candidate) => candidate.trim().toLowerCase())),
      ];
      if (
        targetAudience?.ageMin !== undefined &&
        (!Number.isInteger(targetAudience.ageMin) ||
          targetAudience.ageMin < 13 ||
          targetAudience.ageMin > 100)
      ) {
        return res.status(400).json({ error: "Target minimum age must be a whole number between 13 and 100" });
      }
      if (
        targetAudience?.ageMax !== undefined &&
        (!Number.isInteger(targetAudience.ageMax) ||
          targetAudience.ageMax < 13 ||
          targetAudience.ageMax > 100)
      ) {
        return res.status(400).json({ error: "Target maximum age must be a whole number between 13 and 100" });
      }
      if (
        targetAudience?.ageMin !== undefined &&
        targetAudience?.ageMax !== undefined &&
        targetAudience.ageMin > targetAudience.ageMax
      ) {
        return res.status(400).json({ error: "Target minimum age cannot exceed target maximum age" });
      }

      const selectedCreativeIds = Array.isArray(creativeIds)
        ? [...new Set(creativeIds.filter((id) => typeof id === "string"))]
        : [];
      if (creativeMediaUrl !== undefined && typeof creativeMediaUrl !== "string") {
        return res.status(400).json({ error: "creativeMediaUrl must be a string" });
      }
      const parsedDuration =
        duration === undefined ? null : Number(duration);
      if (
        parsedDuration !== null &&
        (!Number.isInteger(parsedDuration) ||
          parsedDuration < 1 ||
          parsedDuration > 30)
      ) {
        return res.status(400).json({ error: "Duration must be a whole number between 1 and 30 days" });
      }
      const campaignStartDate = startDate ? new Date(startDate) : new Date();
      if (Number.isNaN(campaignStartDate.getTime())) {
        return res.status(400).json({ error: "startDate must be a valid date" });
      }
      const campaignEndDate = endDate
        ? new Date(endDate)
        : parsedDuration !== null
          ? new Date(campaignStartDate.getTime() + parsedDuration * 24 * 60 * 60 * 1000)
          : null;
      if (campaignEndDate && Number.isNaN(campaignEndDate.getTime())) {
        return res.status(400).json({ error: "endDate must be a valid date" });
      }
      if (campaignEndDate && campaignEndDate <= campaignStartDate) {
        return res.status(400).json({ error: "endDate must be after startDate" });
      }
      if (
        creativeMediaUrl &&
        !creativeMediaUrl.startsWith("/api/storage/file/")
      ) {
        return res.status(400).json({
          error:
            "creativeMediaUrl must be a Pocket Dimension storage URL returned by the upload or generation service",
        });
      }

      if (selectedCreativeIds.length > 0) {
        const ownedCreatives = await db
          .select({ id: adCreatives.id })
          .from(adCreatives)
          .where(
            and(
              eq(adCreatives.userId, userId),
              inArray(adCreatives.id, selectedCreativeIds),
            ),
          );
        if (ownedCreatives.length !== selectedCreativeIds.length) {
          return res.status(400).json({
            error: "One or more selected creatives do not exist or are not yours",
          });
        }
      }

      const [campaign] = await db
        .insert(adCampaigns)
        .values({
          userId,
          name,
          platform: platform.trim().toLowerCase(),
          objective: objective || null,
          budget: 0,
          dailyBudget: null,
          startDate: campaignStartDate,
          endDate: campaignEndDate,
          targetAudience: targetAudience || null,
          creativeIds: selectedCreativeIds,
          // The schema has one primary platform column. Preserve every platform
          // selected in the builder so activation can actually fan out to each
          // connected target instead of silently delivering only to the first.
          metadata: { fanOutPlatforms: normalizedPlatforms },
          // A campaign cannot be active until a post actually reaches a
          // connected account. The activation endpoint performs that dispatch.
          status: "draft",
        })
        .returning();

      // Creatives selected in the campaign builder must be linked in both
      // directions.  The previous implementation only populated the campaign
      // array, leaving every creative unassigned and invisible to downstream
      // performance and A/B-test queries.
      if (selectedCreativeIds.length > 0) {
        await db
          .update(adCreatives)
          .set({ campaignId: campaign.id })
          .where(
            and(
              eq(adCreatives.userId, userId),
              inArray(adCreatives.id, selectedCreativeIds),
            ),
          );
      }
      if (creativeMediaUrl) {
        const [creative] = await db
          .insert(adCreatives)
          .values({
            userId,
            campaignId: campaign.id,
            name: `${name} image creative`,
            type: "image",
            mediaUrl: creativeMediaUrl,
            thumbnailUrl: creativeMediaUrl,
            status: "draft",
          })
          .returning({ id: adCreatives.id });
        selectedCreativeIds.push(creative.id);
        await db
          .update(adCampaigns)
          .set({ creativeIds: selectedCreativeIds })
          .where(eq(adCampaigns.id, campaign.id));
        campaign.creativeIds = selectedCreativeIds;
      }

      // Notify and warm the per-user recommendation model after persistence.
      // Dispatch remains an explicit, owned activation action.
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

      });

      res.status(201).json({ success: true, campaign });
    } catch (error) {
      logger.warn({ err: error }, "Failed to create campaign:");
      res.status(500).json({ error: "Failed to create campaign" });
    }
  },
);

router.post(
  "/campaigns/:id/activate",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await advertisingDispatchService.activateCampaign(
      req.params.id,
      req.user!.id,
    );
    if (!result.success || (result.results?.postsCreated ?? 0) === 0) {
      return res.status(409).json(result);
    }
    return res.json(result);
  },
);

router.patch(
  "/campaigns/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      const [existing] = await db
        .select()
        .from(adCampaigns)
        .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const {
        name,
        objective,
        budget,
        dailyBudget,
        startDate,
        endDate,
        targetAudience,
        status,
      } = (req.body ?? {}) as Record<string, unknown>;

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res
            .status(400)
            .json({ error: "Campaign name cannot be empty" });
        }
        updates.name = name;
      }

      if (objective !== undefined) {
        updates.objective = objective || null;
      }

      if (budget !== undefined) {
        const parsedBudget = Number(budget);
        if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
          return res
            .status(400)
            .json({ error: "Budget must be a non-negative number" });
        }
        updates.budget = parsedBudget;
      }

      if (dailyBudget !== undefined) {
        if (dailyBudget === null || dailyBudget === "") {
          updates.dailyBudget = null;
        } else {
          const parsedDaily = Number(dailyBudget);
          if (!Number.isFinite(parsedDaily) || parsedDaily < 0) {
            return res
              .status(400)
              .json({ error: "Daily budget must be a non-negative number" });
          }
          updates.dailyBudget = parsedDaily;
        }
      }

      if (startDate !== undefined) {
        const parsedStartDate = startDate ? new Date(startDate as string) : null;
        if (parsedStartDate && Number.isNaN(parsedStartDate.getTime())) {
          return res.status(400).json({ error: "startDate must be a valid date" });
        }
        updates.startDate = parsedStartDate;
      }

      if (endDate !== undefined) {
        const parsedEndDate = endDate ? new Date(endDate as string) : null;
        if (parsedEndDate && Number.isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: "endDate must be a valid date" });
        }
        updates.endDate = parsedEndDate;
      }

      const effectiveStartDate =
        updates.startDate === undefined ? existing.startDate : updates.startDate;
      const effectiveEndDate =
        updates.endDate === undefined ? existing.endDate : updates.endDate;
      if (
        effectiveStartDate &&
        effectiveEndDate &&
        new Date(effectiveEndDate as Date).getTime() <=
          new Date(effectiveStartDate as Date).getTime()
      ) {
        return res.status(400).json({ error: "endDate must be after startDate" });
      }

      if (targetAudience !== undefined) {
        updates.targetAudience = targetAudience;
      }

      if (status !== undefined) {
        const validStatuses = ["active", "paused", "completed", "draft"];
        if (typeof status !== "string" || !validStatuses.includes(status)) {
          return res.status(400).json({
            error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          });
        }
        // A campaign may only become active by actually posting to a
        // connected account (see POST /campaigns/:id/activate, which sets
        // status:"active" solely when successfulPosts > 0). Allowing this
        // generic PATCH to set status:"active" directly would let a
        // campaign claim to be running with zero real posts, and would
        // then permanently block the real activation endpoint (it refuses
        // to re-activate a campaign that is already "active").
        if (status === "active" && existing.status !== "active") {
          return res.status(400).json({
            error:
              "Campaigns can only become active through POST /campaigns/:id/activate, which posts to your connected accounts before marking the campaign active.",
          });
        }
        updates.status = status;
      }

      const [updated] = await db
        .update(adCampaigns)
        .set(updates)
        .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)))
        .returning();

      res.json({ success: true, campaign: updated });
    } catch (error) {
      logger.warn({ err: error }, "Failed to update campaign:");
      res.status(500).json({ error: "Failed to update campaign" });
    }
  },
);

router.delete(
  "/campaigns/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params as Record<string, string>;

      const [existing] = await db
        .select()
        .from(adCampaigns)
        .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      await db
        .update(adCreatives)
        .set({ campaignId: null })
        .where(
          and(eq(adCreatives.campaignId, id), eq(adCreatives.userId, userId)),
        );

      await db
        .delete(adCampaigns)
        .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)));

      res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Failed to delete campaign:");
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  },
);

router.post(
  "/creatives",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, type, mediaUrl, thumbnailUrl } = (req.body ?? {}) as Record<
        string,
        unknown
      >;

      if (!mediaUrl || typeof mediaUrl !== "string") {
        return res.status(400).json({ error: "mediaUrl is required" });
      }
      if (type !== "image" && type !== "video") {
        return res
          .status(400)
          .json({ error: "type must be 'image' or 'video'" });
      }
      if (!mediaUrl.startsWith("/api/storage/file/")) {
        return res.status(400).json({
          error:
            "mediaUrl must be a Pocket Dimension storage URL returned by the upload or generation service",
        });
      }
      if (
        thumbnailUrl !== undefined &&
        thumbnailUrl !== null &&
        (typeof thumbnailUrl !== "string" ||
          !thumbnailUrl.startsWith("/api/storage/file/"))
      ) {
        return res.status(400).json({
          error:
            "thumbnailUrl must be a Pocket Dimension storage URL returned by the upload or generation service",
        });
      }

      const [creative] = await db
        .insert(adCreatives)
        .values({
          userId,
          campaignId: null,
          name:
            typeof name === "string" && name.trim()
              ? name
              : `AI ${type} creative`,
          type,
          mediaUrl,
          thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : null,
          status: "draft",
        })
        .returning();

      res.status(201).json({ success: true, creative });
    } catch (error) {
      logger.warn({ err: error }, "Failed to create creative:");
      res.status(500).json({ error: "Failed to create creative" });
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

    const [campaigns, autopilotConfig] = await Promise.all([
      db
        .select({
          platform: adCampaigns.platform,
          status: adCampaigns.status,
          organicMetrics: adCampaigns.organicMetrics,
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
      const metrics = (c?.organicMetrics || {}) as Record<string, unknown>;
      return sum + Number(metrics.totalReach ?? 0);
    }, 0);
    const estimatedAdEquivalent = campaigns?.reduce((sum, c) => {
      const metrics = (c?.organicMetrics || {}) as Record<string, unknown>;
      const reach = Number(metrics.totalReach ?? 0);
      return sum + adEquivalentValue(c?.platform, reach);
    }, 0);

    res.json({
      // A real dedicated advertising-autopilot worker exists
      // (advertisingAutopilotRunner.ts, ticked every 30 min by
      // autonomousJobScheduler.ts) and is genuinely reachable via /start —
      // report its actual persisted state instead of a hardcoded value.
      isRunning: Boolean(
        (autopilotConfig as { enabled?: boolean; isRunning?: boolean } | null)
          ?.enabled &&
          (autopilotConfig as { isRunning?: boolean } | null)?.isRunning,
      ),
      automationAvailable: true,
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
    // The dedicated advertising-autopilot worker (advertisingAutopilotRunner.ts)
    // is genuinely scheduled every 30 min by autonomousJobScheduler.ts and only
    // acts on users whose persisted config has enabled+isRunning true. Flip
    // that real switch instead of claiming no worker exists.
    const existing = await storage.getAdvertisingAutopilotConfig(userId);
    const config = { ...(existing || {}), enabled: true, isRunning: true };
    await storage.saveAdvertisingAutopilotConfig(userId, config);
    logger.info(`▶️ Advertising autopilot started for user ${userId}`);
    res.json({
      success: true,
      message: "Advertising autopilot started",
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

    const variants = creatives.flatMap((creative) => {
      const performance =
        (creative.performance as Record<string, unknown> | null) ?? {};
      const impressions = Number(performance.impressions ?? 0);
      const clicks = Number(performance.clicks ?? 0);
      const conversions = Number(performance.conversions ?? 0);

      const persistedCreative = creative.campaignId
        ? [
            {
              id: creative.id,
              creativeId: creative.id,
              creativeName: creative.name,
              name: creative.name,
              headline: creative.headline ?? "",
              description: creative.description ?? "",
              cta: creative.callToAction ?? "",
              imageUrl: creative.thumbnailUrl ?? creative.mediaUrl ?? undefined,
              status: creative.status ?? "draft",
              impressions,
              clicks,
              conversions,
              ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
              conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
              confidence: 0,
              predictionScore: 0,
              createdAt: creative.createdAt,
            },
          ]
        : [];

      const legacyVariants = Array.isArray(creative.variants)
        ? (creative.variants as Record<string, unknown>[]).map((variant, idx) => ({
            id: `${creative.id}-v${idx}`,
            creativeId: creative.id,
            creativeName: creative.name,
            variantIndex: idx,
            ...variant,
          }))
        : [];
      return [...persistedCreative, ...legacyVariants];
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
          // Attribution models require ordered touchpoint events, which are
          // not stored for campaigns.  Preserve the real aggregate metrics,
          // but report zero model credit rather than inventing a journey.
          channel: platform,
          platform,
          color: undefined,
          organicReach: data.organicReach,
          conversions: data.conversions,
          engagements: data.engagements,
          campaigns: data.campaigns,
          adEquivalentValue: Math.round(adEquivalentValue(platform, data.organicReach) * 100) / 100,
          adSpend: 0,
          revenue: 0,
          assists: 0,
          avgTouchpoints: 0,
          firstTouch: 0,
          lastTouch: 0,
          linear: 0,
          timeDecay: 0,
          positionBased: 0,
          dataDriven: 0,
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

      // A campaign platform/objective is not a conversion path.  No
      // touchpoint event store exists yet, so exposing those fields as a
      // customer journey was fabricated attribution data.
      res.json({ paths: [] });
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
        const rev = Number(perf?.revenue ?? 0);
        channelMap?.set(c?.platform, (channelMap?.get(c?.platform) || 0) + rev);
        total += rev;
      }

      const channels = Array.from(channelMap.entries()).map(
        ([platform, revenue]) => ({
          channel: platform,
          revenue,
          conversions: 0,
          assists: 0,
          firstClick: 0,
          lastClick: 0,
          linear: 0,
          timeDecay: 0,
          positionBased: 0,
          share: total > 0 ? revenue / total : 0,
        }),
      );

      res.json({ channels, total });
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

      res.json({ paths: [] });
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
              (Date.now() - new Date(c?.createdAt).getTime()) /
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
        .select({ id: adCampaigns.id })
        .from(adCampaigns)
        .where(
          and(eq(adCampaigns.userId, userId), eq(adCampaigns.status, "active")),
        )
        .limit(100);

      res.json({
        forecast: {
          daily: [],
          weekly: [],
          monthly: [],
          activeCampaigns: campaigns.length,
          methodology: "unavailable",
          adSpend: 0,
          note:
            "Forecasts are unavailable until a validated forecasting model is connected to platform delivery data.",
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
    const userId = (req as AuthenticatedRequest).user!.id;

    if (!campaignId) {
      return res.status(400).json({ error: "Campaign ID is required" });
    }

    const [storedCampaign] = await db
      .select()
      .from(adCampaigns)
      .where(
        and(eq(adCampaigns.id, campaignId), eq(adCampaigns.userId, userId)),
      )
      .limit(1);
    if (!storedCampaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const campaignCreatives = await db
      .select({
        id: adCreatives.id,
        type: adCreatives.type,
        headline: adCreatives.headline,
        description: adCreatives.description,
        callToAction: adCreatives.callToAction,
      })
      .from(adCreatives)
      .where(
        and(
          eq(adCreatives.campaignId, campaignId),
          eq(adCreatives.userId, userId),
        ),
      );

    // Optimize only the persisted campaign the caller owns. Use actual
    // delivery data rather than manufacturing metrics for an arbitrary ID.
    const persistedPerformance =
      (storedCampaign.performance as Record<string, unknown> | null) ?? {};
    const perf = persistedPerformance;
    const platform = storedCampaign.platform;
    const organicReach = Number(perf.organicReach ?? perf.impressions ?? 0);
    const campaign = {
      id: campaignId,
      name: storedCampaign.name,
      platform,
      objective: storedCampaign.objective || "awareness",
      status: storedCampaign.status || "draft",
      budget: Number(storedCampaign.budget ?? 0),
      dailyBudget: Number(storedCampaign.dailyBudget ?? 0),
      startDate: storedCampaign.startDate ?? new Date(),
      targeting: {
        ageMin: Number((storedCampaign.targetAudience as any)?.ageMin ?? 0),
        ageMax: Number((storedCampaign.targetAudience as any)?.ageMax ?? 0),
        genders: [] as ("male" | "female")[],
        locations: (storedCampaign.targetAudience as any)?.locations ?? [],
        interests: (storedCampaign.targetAudience as any)?.interests ?? [],
        behaviors: [],
        customAudiences: [],
        lookalikes: [],
        excludedAudiences: [],
      },
      creatives: campaignCreatives.map((creative) => ({
        id: creative.id,
        type: creative.type === "video" ? ("video" as const) : ("image" as const),
        headline: creative.headline ?? "",
        body: creative.description ?? "",
        callToAction: creative.callToAction ?? "",
      })),
      metrics: {
        organicReach,
        impressions: organicReach,
        clicks: Number(perf.clicks ?? 0),
        conversions: Number(perf.conversions ?? 0),
        engagements: Number(perf.engagements ?? 0),
        adSpend: 0,
        adEquivalentValue: adEquivalentValue(platform, organicReach),
        ctr: Number(perf.ctr ?? 0),
        engagementRate: Number(perf.engagementRate ?? 0),
        viralScore: Number(perf.viralScore ?? 0),
      },
    };

    const maxCoreResult = requireMaxCore(
      await MaxCoreAIClient.infer<Record<string, unknown>>(
        "/api/optimize/ad",
        buildAdOptimizationRequest(campaign),
      ),
      "advertising campaign optimization",
    );
    const optimization =
      (maxCoreResult as Record<string, unknown>)?.data ?? maxCoreResult;
    if (
      !optimization ||
      typeof optimization !== "object" ||
      Object.keys(optimization as Record<string, unknown>).length === 0 ||
      (optimization as Record<string, unknown>).success === false
    ) {
      throw new AIUnavailableError(
        "advertising campaign optimization returned no result",
      );
    }
    if (typeof (optimization as Record<string, unknown>).score !== "number") {
      throw new AIUnavailableError(
        "advertising campaign optimization returned no numeric score",
      );
    }

    res.json({
      success: true,
      campaignId,
      optimization,
      recommendations:
        (optimization as Record<string, unknown>)?.recommendations || [],
    });

    setImmediate(async () => {
        try {
          const campaignName = storedCampaign.name;
          const topRec =
            ((optimization as any)?.recommendations as string[] | undefined)?.[0] ||
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
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        error: error.message,
      });
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
      musicData,
      targetAudience,
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

    const resolvedPlatform = validPlatforms.includes(platform)
      ? platform
      : "instagram";
    const resolvedTone = validTones.includes(tone) ? tone : "energetic";
    const audienceContext =
      typeof targetAudience === "string"
        ? targetAudience.trim()
        : targetAudience && typeof targetAudience === "object"
          ? JSON.stringify(targetAudience)
          : "";
    const musicContext =
      musicData && typeof musicData === "object"
        ? JSON.stringify(musicData)
        : "";
    const generated = normalizeAdContent(
      await MaxCoreAIClient.infer<Record<string, unknown>>(
        "/api/generate/content",
        {
          topic: topic || "new music",
          platform: resolvedPlatform,
          tone: resolvedTone,
          content_type: contentType === "ad_copy" ? "promotional" : contentType,
          include_hashtags: true,
          include_emojis: true,
          extra_context: [
            "Create advertising copy for the artist's music promotion.",
            audienceContext && `Target audience: ${audienceContext}`,
            musicContext && `Music context: ${musicContext}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ),
    );
    const content = requireMaxCore(generated, "advertising content generation");

    res.json({
      success: true,
      campaignId,
      content,
      source: "MaxCoreAI",
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, error: error.message });
    }
    logger.warn({ err: error }, "Failed to generate ad content:");
    res.status(500).json({ error: "Failed to generate content" });
  }
});

/**
 * Generate a campaign for content selected on the Advertisement page.
 *
 * This is deliberately separate from the legacy social VEO route: the page's
 * Generate button must use the mounted advertising router and MaxCore's ads
 * contract, never the retired local/Python VEO pipeline.
 */
router.post(
  "/generate-campaign",
  requireAuthOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, error: "Authentication required" });
      }

      const {
        contentType,
        contentId,
        platforms,
        goal,
        ad_type,
        brand_notes,
        campaign_notes,
      } = (req.body ?? {}) as Record<string, unknown>;
      if (
        typeof contentType !== "string" ||
        !PROMOTABLE_CONTENT_TYPES.includes(contentType as any)
      ) {
        return res.status(400).json({
          success: false,
          error: `Invalid contentType. Must be one of: ${PROMOTABLE_CONTENT_TYPES.join(", ")}`,
        });
      }

      let source;
      try {
        source = await resolvePromotableContent(
          userId,
          contentType as any,
          typeof contentId === "string" ? contentId : undefined,
        );
      } catch (error) {
        if (error instanceof PromotableContentError) {
          return res
            .status(error.status)
            .json({ success: false, error: error.message });
        }
        throw error;
      }

      const selectedPlatform =
        Array.isArray(platforms) &&
        typeof platforms.find(
          (value) => typeof value === "string" && value.trim(),
        ) === "string"
          ? (platforms.find(
              (value) => typeof value === "string" && value.trim(),
            ) as string)
          : "instagram";
      const campaignRequest = buildAdGenerationRequest(userId, source, {
        platform: selectedPlatform,
        goal:
          typeof goal === "string" &&
          ["streams", "merch", "fanbase", "tickets", "downloads", "conversions"].includes(
            goal,
          )
            ? goal
            : "streams",
        adType:
          typeof ad_type === "string" && ad_type.trim() ? ad_type : "video",
        instruction: [brand_notes, campaign_notes]
          .filter((value): value is string => typeof value === "string")
          .join("\n"),
      });

      const generated = requireMaxCore(
        await MaxCoreAIClient.infer<Record<string, unknown>>(
          "/api/platform/ads/generate",
          campaignRequest,
        ),
        "advertising campaign generation",
      );
      const campaign =
        (generated as Record<string, unknown>)?.data ?? generated;
      if (
        !campaign ||
        typeof campaign !== "object" ||
        Object.keys(campaign as Record<string, unknown>).length === 0 ||
        (campaign as Record<string, unknown>).success === false
      ) {
        throw new AIUnavailableError(
          "advertising campaign generation returned no campaign",
        );
      }

      return res.json({
        success: true,
        campaign,
        contentType: source.contentType,
        source: source.summary,
        sourceSystem: "MaxCoreAI",
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          error: error.message,
        });
      }
      logger.warn({ err: error }, "Failed to generate ad campaign:");
      return res
        .status(500)
        .json({ success: false, error: "Campaign generation failed" });
    }
  },
);

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
        hook,
        body,
        cta,
        voiceover,
        quality,
      } = req.body;

      // Route through the Advanced Video Renderer (MaxCore only).
      const result = await renderAdvancedVideo({
        topic: topic || "music promotion",
        platform: platform || "instagram",
        template: template || "cinematic_promo",
        aspect_ratio,
        duration: duration || 10,
        tone: tone || "energetic",
        goal: goal || "growth",
        artist_name,
          hook,
          body,
          cta,
          voiceover: voiceover === true,
        quality: quality || "cinematic",
        userId: req.user!.id,
      });

      if (!result?.success) {
        throw new AIUnavailableError(
          result?.error || "advertising video generation",
        );
      }

      logger.info(
        `[AdVideoGen] Video ready via ${result?.source || "renderer"}`,
      );
      res.json(result);
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          error: error.message,
        });
      }
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
      const {
        prompt: requestedPrompt,
        topic,
        slots,
        intent,
        platform,
        tone,
        goal,
        artist_name,
        style,
        aspect_ratio,
      } = req.body;
      // `prompt` is the MaxCore contract. Keep the legacy UI's `topic` alias
      // at this HTTP boundary until all clients have migrated.
      const prompt =
        typeof requestedPrompt === "string" && requestedPrompt.trim()
          ? requestedPrompt
          : topic;

      if (typeof prompt !== "string" || !prompt.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "Prompt is required" });
      }

      // ── Tier 1: MaxCore (sole AI source) ─────────────────────────────────────
      type McImageResp = {
        url?: string;
        image_url?: string;
        path?: string;
        outputs?: Array<{ url?: string }>;
        width?: number;
        height?: number;
        format?: string;
        prompt_used?: string;
      };
      const mcImageData = requireMaxCore(
        await MaxCoreAIClient.infer<McImageResp>("/api/generate/image", {
          ...buildImageGenerationRequest({
            prompt: prompt.trim(),
            slots,
            intent,
            platform,
            tone,
            goal,
            artist_name,
            style,
            aspect_ratio,
          }),
        }),
        "advertising image generation",
      );

      const imageUrl =
        mcImageData?.url ??
        mcImageData?.image_url ??
        mcImageData?.path ??
        mcImageData?.outputs?.find((output) => output?.url)?.url;
      if (imageUrl) {
        try {
          const pdimUrl = await mirrorGeneratedImageToPDIM(imageUrl);
          return res.json({
            success: true,
            ...mcImageData,
            url: pdimUrl,
            image_url: pdimUrl,
          });
        } catch (mirrorError) {
          logger.warn(
            { err: mirrorError, userId: req.user!.id },
            "MaxCore image could not be mirrored to Pocket Dimension",
          );
          return res.status(502).json({
            success: false,
            error:
              "Image generation returned content that was not persisted to Pocket Dimension",
          });
        }
      }

      throw new AIUnavailableError(
        "advertising image generation returned no image",
      );
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
        res.status(503).json({
          error: "Video template service is unavailable",
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
