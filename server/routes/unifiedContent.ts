/**
 * Unified Content Generation API Route
 *
 * Exposes the single-function entry point for Max Booster's unified Social
 * Media Management and Advertisement Content Generation pipeline.
 *
 * Endpoints:
 *
 *   POST /api/content/generate-unified
 *     Full pipeline: artist + Max Booster content, all platforms, all types,
 *     ad creatives, scripts, visuals, scheduling metadata — returned in one call.
 *
 *   POST /api/content/generate-unified/artist-only
 *     Artist personal brand content only (faster, no Max Booster feature content).
 *
 *   POST /api/content/generate-unified/maxbooster-only
 *     Max Booster feature content only (for platform marketing campaigns).
 *
 *   POST /api/content/generate-unified/platform/:platform
 *     Single-platform preview bundle (quick test / UI preview).
 *
 *   GET  /api/content/generate-unified/platforms
 *     Returns the list of supported platforms and their specs.
 *
 *   GET  /api/content/generate-unified/features
 *     Returns the Max Booster feature registry used by the content strategy.
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../logger?.js";
import { requireAuth } from "../middleware/auth?.js";
import {
  unifiedContentOrchestrator,
  type UnifiedContentInput,
  type BoostSheetInput,
  type ArtistContextInput,
} from "../services/unifiedContentOrchestrator?.js";
import {
  PLATFORM_SPECS,
  ALL_PLATFORMS,
  type SupportedPlatform,
} from "../services/contentPipeline/platformFormatters?.js";
import { MAX_BOOSTER_FEATURES } from "../services/contentPipeline/maxBoosterContentStrategy?.js";

const _router = Router();

// ─── Input validation ─────────────────────────────────────────────────────────

function validateInput(body: unknown): {
  valid: boolean;
  error?: string;
  input?: UnifiedContentInput;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const _b = body as Record<string, unknown>;

  if (!b?.artistName || typeof b?.artistName !== "string") {
    return { valid: false, error: "artistName is required (string)" };
  }
  if (!b?.genre || typeof b?.genre !== "string") {
    return { valid: false, error: "genre is required (string)" };
  }
  if (!b?.mood || typeof b?.mood !== "string") {
    return { valid: false, error: "mood is required (string)" };
  }

  const _validPlatforms = new Set(ALL_PLATFORMS);
  const _requestedPlatforms = Array?.isArray(b?.platforms)
    ? (b?.platforms as string[])
    : undefined;
  if (requestedPlatforms) {
    const _invalid = requestedPlatforms?.filter(
      (p) => !validPlatforms?.has(p as SupportedPlatform),
    );
    if (invalid?.length > 0) {
      return {
        valid: false,
        error: `Invalid platforms: ${invalid?.join(", ")}. Supported: ${ALL_PLATFORMS?.join(", ")}`,
      };
    }
  }

  const _inputType =
    (b?.type as string) === "boostsheet" ? "boostsheet" : "artist_context";
  const _commonFields = {
    artistName: b?.artistName as string,
    genre: b?.genre as string,
    mood: b?.mood as string,
    trackTitle: b?.trackTitle as string | undefined,
    albumTitle: b?.albumTitle as string | undefined,
    releaseDate: b?.releaseDate as string | undefined,
    streamingLinks: b?.streamingLinks as Record<string, string> | undefined,
    bio: b?.bio as string | undefined,
    brandVoice:
      (b?.brandVoice as ArtistContextInput["brandVoice"]) ?? "energetic",
    colorPalette: Array?.isArray(b?.colorPalette)
      ? (b?.colorPalette as string[])
      : undefined,
    targetAudience: b?.targetAudience as string | undefined,
    keywords: Array?.isArray(b?.keywords) ? (b?.keywords as string[]) : undefined,
    campaignGoal:
      (b?.campaignGoal as ArtistContextInput["campaignGoal"]) ?? "growth",
    platforms: requestedPlatforms as SupportedPlatform[] | undefined,
    collaborators: Array?.isArray(b?.collaborators)
      ? (b?.collaborators as string[])
      : undefined,
    upcomingEvents: Array?.isArray(b?.upcomingEvents)
      ? (b?.upcomingEvents as unknown[])
      : undefined,
    socialHandles: b?.socialHandles as Record<string, string> | undefined,
    targetArtistSegment:
      (b?.targetArtistSegment as ArtistContextInput["targetArtistSegment"]) ??
      "emerging_artist",
    schedulingOptions: b?.schedulingOptions as
      | Record<string, unknown>
      | undefined,
  };

  const input: UnifiedContentInput =
    inputType === "boostsheet"
      ? ({
          ...commonFields,
          type: "boostsheet",
          sheetId: b?.sheetId as string | undefined,
        } as BoostSheetInput)
      : ({ ...commonFields, type: "artist_context" } as ArtistContextInput);

  return { valid: true, input };
}

// ─── POST /api/content/generate-unified ──────────────────────────────────────

router?.post("/", requireAuth, async (req: Request, res: Response) => {
  const { valid, error, input } = validateInput(req?.body);
  if (!valid || !input) {
    res?.status(400).json({ error });
    return;
  }

  try {
    logger?.info(
      `[UnifiedContent] Full pipeline triggered by user=${req?.user?.id ?? "unknown"} artist="${input?.artistName}"`,
    );
    const _pkg = await unifiedContentOrchestrator?.generate(input);

    res?.json({
      success: true,
      runId: pkg?.runId,
      generatedAt: pkg?.generatedAt,
      stats: pkg?.stats,
      artistContent: pkg?.artistContent,
      maxBoosterContent: pkg?.maxBoosterContent,
      platformBundles: pkg?.platformBundles,
      scheduleManifest: pkg?.scheduleManifest,
      bulkSchedulePayload: pkg?.bulkSchedulePayload,
    });
  } catch (err) {
    logger?.warn(`[UnifiedContent] Pipeline error: ${(err as Error).message}`, {
      stack: (err as Error).stack,
    });
    res
      .status(500)
      .json({
        error: "Content generation pipeline failed",
        detail: (err as Error).message,
      });
  }
});

// ─── POST /api/content/generate-unified/artist-only ──────────────────────────

router?.post(
  "/artist-only",
  requireAuth,
  async (req: Request, res: Response) => {
    const { valid, error, input } = validateInput(req?.body);
    if (!valid || !input) {
      res?.status(400).json({ error });
      return;
    }

    try {
      const _content =
        await unifiedContentOrchestrator?.generateArtistContentOnly(input);
      res?.json({
        success: true,
        count: content?.length,
        artistContent: content,
      });
    } catch (err) {
      logger?.warn(`[UnifiedContent/artist-only] ${(err as Error).message}`);
      res
        .status(500)
        .json({
          error: "Artist content generation failed",
          detail: (err as Error).message,
        });
    }
  },
);

// ─── POST /api/content/generate-unified/maxbooster-only ──────────────────────

router?.post(
  "/maxbooster-only",
  requireAuth,
  async (req: Request, res: Response) => {
    const { valid, error, input } = validateInput(req?.body);
    if (!valid || !input) {
      res?.status(400).json({ error });
      return;
    }

    try {
      const _content =
        await unifiedContentOrchestrator?.generateMaxBoosterContentOnly(input);
      res?.json({
        success: true,
        count: content?.length,
        maxBoosterContent: content,
      });
    } catch (err) {
      logger?.warn(`[UnifiedContent/maxbooster-only] ${(err as Error).message}`);
      res
        .status(500)
        .json({
          error: "Max Booster content generation failed",
          detail: (err as Error).message,
        });
    }
  },
);

// ─── POST /api/content/generate-unified/platform/:platform ───────────────────

router?.post(
  "/platform/:platform",
  requireAuth,
  async (req: Request, res: Response) => {
    const _platform = req?.params.platform as SupportedPlatform;

    if (!ALL_PLATFORMS?.includes(platform)) {
      res?.status(400).json({
        error: `Unknown platform: ${platform}`,
        supported: ALL_PLATFORMS,
      });
      return;
    }

    const { valid, error, input } = validateInput(req?.body);
    if (!valid || !input) {
      res?.status(400).json({ error });
      return;
    }

    try {
      const _bundle = await unifiedContentOrchestrator?.generateForPlatform(
        input,
        platform,
      );
      res?.json({ success: true, platform, bundle });
    } catch (err) {
      logger?.warn(
        `[UnifiedContent/platform/${platform}] ${(err as Error).message}`,
      );
      res
        .status(500)
        .json({
          error: `Platform bundle generation failed for ${platform}`,
          detail: (err as Error).message,
        });
    }
  },
);

// ─── GET /api/content/generate-unified/platforms ─────────────────────────────

router?.get("/platforms", (_req: Request, res: Response) => {
  res?.json({
    platforms: ALL_PLATFORMS?.map((p) => ({
      id: p,
      ...PLATFORM_SPECS[p],
    })),
  });
});

// ─── GET /api/content/generate-unified/features ──────────────────────────────

router?.get("/features", (_req: Request, res: Response) => {
  res?.json({
    features: MAX_BOOSTER_FEATURES?.map((f) => ({
      id: f?.id,
      displayName: f?.displayName,
      category: f?.category,
      tagline: f?.tagline,
      valueProp: f?.valueProp,
      relevantPlatforms: f?.relevantPlatforms,
      contentAngles: f?.contentAngles,
    })),
  });
});

export default router;
