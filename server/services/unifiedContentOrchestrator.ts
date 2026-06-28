/**
 * Unified Content Orchestrator
 *
 * The single entry point for Max Booster's unified Social Media Management
 * and Advertisement Content Generation system.
 *
 * Accepts a BoostSheet or ArtistContext as root input and produces a complete
 * UnifiedContentPackage that includes:
 *
 *   - Platform-formatted content for ALL supported platforms
 *   - Ad creatives (captions, hooks, scripts, visual specs)
 *   - Max Booster feature content for every platform subsystem
 *   - Artist brand, music, and release content
 *   - Scheduling metadata ready for the bulk-schedule endpoint
 *   - PDIM-backed queue jobs for async delivery
 *
 * All generation flows through: MaxCore AI → Python AI → In-house JS fallback
 * exactly matching the existing UnifiedAIController priority chain.
 *
 * Usage:
 *   const pkg = await unifiedContentOrchestrator.generate(input);
 *   // pkg is ready to schedule, publish, or store
 */

import { logger } from "../logger.js";
import { getRedisClient } from "../lib/redisConnectionFactory.js";

import { PLATFORM_SPECS, assembleCaption, getVisualSpec, enforceHashtagLimit, type SupportedPlatform, type ContentSlot } from "./contentPipeline/platformFormatters.js";

import {
  generateHooks,
  generateCaptions,
  generateHashtags,
  generateAdCopy,
  generateVideoScript,
  generateVisualPrompt,
  generateStorySequence,
  type GeneratorContext,
  type HookSet,
  type CaptionSet,
  type HashtagSet,
  type AdCopySet,
  type VideoScript,
  type VisualPrompt,
  type StorySequence,
} from "./contentPipeline/contentTypeGenerators.js";

import {
  buildScheduleManifest,
  manifestToBulkSchedulePayload,
  type ScheduleManifest,
  type SchedulingOptions,
} from "./contentPipeline/schedulingMetadataBuilder.js";

import {
  generateAllMaxBoosterContent,
  type MaxBoosterContentPiece,
  type MaxBoosterContentContext,
} from "./contentPipeline/maxBoosterContentStrategy.js";

import {
  generateAllArtistContent,
  type ArtistContext,
  type ArtistContentPiece,
} from "./contentPipeline/artistContentStrategy.js";

// ─── Root Input Types ─────────────────────────────────────────────────────────

/**
 * BoostSheet input — use when triggering from an existing BoostSheet record.
 * Fields map directly to the BoostSheetResult interface in pythonAIService.ts.
 */
export interface BoostSheetInput {
  type: "boostsheet";
  sheetId?: string;
  platform?: SupportedPlatform;
  blocks?: Record<string, unknown>;
  /** Artist/track metadata extracted from the BoostSheet */
  artistName: string;
  genre: string;
  mood: string;
  trackTitle?: string;
  releaseDate?: string;
  albumTitle?: string;
  bio?: string;
  streamingLinks?: Partial<Record<string, string>>;
  brandVoice?: GeneratorContext["brandVoice"];
  colorPalette?: string[];
  targetAudience?: string;
  keywords?: string[];
  campaignGoal?: GeneratorContext["campaignGoal"];
  platforms?: SupportedPlatform[];
  collaborators?: string[];
  upcomingEvents?: ArtistContext["upcomingEvents"];
  socialHandles?: Partial<Record<SupportedPlatform, string>>;
  targetArtistSegment?: MaxBoosterContentContext["targetArtistSegment"];
  schedulingOptions?: Partial<SchedulingOptions>;
}

/**
 * ArtistContextInput — use when triggering directly from artist profile data.
 */
export interface ArtistContextInput {
  type: "artist_context";
  artistName: string;
  genre: string;
  mood: string;
  trackTitle?: string;
  releaseDate?: string;
  albumTitle?: string;
  bio?: string;
  streamingLinks?: Partial<Record<string, string>>;
  brandVoice?: GeneratorContext["brandVoice"];
  colorPalette?: string[];
  targetAudience?: string;
  keywords?: string[];
  campaignGoal?: GeneratorContext["campaignGoal"];
  platforms?: SupportedPlatform[];
  collaborators?: string[];
  upcomingEvents?: ArtistContext["upcomingEvents"];
  socialHandles?: Partial<Record<SupportedPlatform, string>>;
  targetArtistSegment?: MaxBoosterContentContext["targetArtistSegment"];
  schedulingOptions?: Partial<SchedulingOptions>;
}

export type UnifiedContentInput = BoostSheetInput | ArtistContextInput;

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface PlatformContentBundle {
  platform: SupportedPlatform;
  hooks: HookSet;
  captions: CaptionSet;
  hashtags: HashtagSet;
  adCopy: AdCopySet;
  videoScript: VideoScript;
  visualPrompt: VisualPrompt;
  storySequence: StorySequence;
  formattedPosts: FormattedPost[];
}

export interface FormattedPost {
  platform: SupportedPlatform;
  slot: ContentSlot;
  finalCaption: string;
  firstComment?: string;
  hashtags: string[];
  hook: string;
  cta: string;
  visualSpec: ReturnType<typeof getVisualSpec>;
  adCopy?: AdCopySet;
  rawContent: string;
  source?: string;
}

export interface UnifiedContentPackage {
  /** Unique run identifier */
  runId: string;
  generatedAt: Date;
  input: UnifiedContentInput;

  /** Artist personal brand content — all verticals, all platforms */
  artistContent: ArtistContentPiece[];

  /** Max Booster platform content — all features, all platforms */
  maxBoosterContent: MaxBoosterContentPiece[];

  /** Per-platform fully formatted content bundles */
  platformBundles: PlatformContentBundle[];

  /** Ready-to-schedule manifest for the bulk scheduler */
  scheduleManifest: ScheduleManifest;

  /** Pre-built payload for POST /api/social/bulk/schedule */
  bulkSchedulePayload: Array<{
    platform: string;
    content: string;
    scheduledAt: string;
  }>;

  /** Aggregate stats */
  stats: {
    totalPieces: number;
    platformsGenerated: number;
    artistPieces: number;
    maxBoosterPieces: number;
    scheduledPosts: number;
    generationTimeMs: number;
  };
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeInput(input: UnifiedContentInput): {
  artistCtx: ArtistContext;
  generatorCtx: Omit<GeneratorContext, "platform">;
  platforms: SupportedPlatform[];
  schedulingOptions: Partial<SchedulingOptions>;
  targetArtistSegment: MaxBoosterContentContext["targetArtistSegment"];
  campaignGoal: GeneratorContext["campaignGoal"];
} {
  const colorPalette = input.colorPalette ?? [
    "#1a1a2e",
    "#16213e",
    "#0f3460",
    "#e94560",
  ];
  const brandVoice = input.brandVoice ?? "energetic";
  const targetAudience = input.targetAudience ?? "music fans aged 18–35";
  const keywords = input.keywords ?? [
    input.genre,
    input.mood,
    input.artistName,
  ];
  const campaignGoal = input.campaignGoal ?? "growth";
  const platforms: SupportedPlatform[] = input.platforms ?? [
    "tiktok",
    "instagram",
    "youtube",
    "twitter",
  ];
  const targetArtistSegment = input.targetArtistSegment ?? "emerging_artist";

  const artistCtx: ArtistContext = {
    artistName: input.artistName,
    genre: input.genre,
    mood: input.mood,
    trackTitle: input.trackTitle,
    albumTitle: input.albumTitle,
    releaseDate: input.releaseDate,
    streamingLinks: input.streamingLinks,
    bio: input.bio,
    brandVoice,
    colorPalette,
    targetAudience,
    socialHandles: input.socialHandles,
    milestones: [],
    upcomingEvents: input.upcomingEvents,
    collaborators: input.collaborators,
    keywords,
  };

  const generatorCtx: Omit<GeneratorContext, "platform"> = {
    artistName: input.artistName,
    genre: input.genre,
    mood: input.mood,
    trackTitle: input.trackTitle,
    releaseDate: input.releaseDate,
    brandVoice,
    colorPalette,
    targetAudience,
    campaignGoal,
    keywords,
    avoidTopics: [],
  };

  return {
    artistCtx,
    generatorCtx,
    platforms,
    schedulingOptions: input.schedulingOptions ?? {},
    targetArtistSegment,
    campaignGoal,
  };
}

// ─── Platform Bundle Builder ──────────────────────────────────────────────────

// ─── Generator fallbacks (used when a generator rejects unexpectedly) ─────────

function hooksFallback(ctx: GeneratorContext): HookSet {
  return {
    primary: `${ctx.artistName} just changed the game 🎵`,
    alternates: [
      `The ${ctx.genre} sound you've been waiting for`,
      `${ctx.mood} energy × ${ctx.artistName} = this`,
    ],
    questionHook: `Ever wonder what real ${ctx?.genre} feels like?`,
    statementHook: `${ctx?.artistName} is ${ctx?.mood} and unapologetic.`,
    cliffhangerHook: `This song almost wasn't released...`,
  };
}

function captionsFallback(ctx: GeneratorContext): CaptionSet {
  return {
    short: `${ctx.artistName} 🔥 ${ctx.mood} ${ctx.genre} — out now.`,
    medium: `${ctx.artistName} is bringing the ${ctx.mood} energy to ${ctx.genre}. New music is here. 🎵`,
    long: `${ctx.artistName} has been working on something special. The ${ctx.mood} atmosphere, the ${ctx.genre} DNA — this is the sound you needed. Stream now.`,
    platform: ctx.platform,
  };
}

function adCopyFallback(ctx: GeneratorContext): AdCopySet {
  return {
    headline: `Stream ${ctx.artistName} Now`,
    subheadline: `${ctx.mood} ${ctx.genre} that hits different`,
    body: `New music from ${ctx.artistName}. Available everywhere.`,
    cta: "Stream Now",
    variants: [
      {
        headline: `${ctx.artistName} — New Release`,
        body: `The sound you didn't know you needed.`,
        cta: "Listen Free",
      },
      {
        headline: `Feel Something Real`,
        body: `${ctx?.artistName} brings the ${ctx?.mood} ${ctx?.genre} heat.`,
        cta: "Play Now",
      },
    ],
  };
}

function videoScriptFallback(ctx: GeneratorContext): VideoScript {
  return {
    hook: `${ctx?.artistName} drops the ${ctx?.mood} ${ctx?.genre} anthem you needed.`,
    body: [
      `Show the creative process`,
      `Highlight the emotion`,
      `Connect with the audience`,
    ],
    cta: `Follow ${ctx?.artistName} now.`,
    durationHint: "30s",
    bRoll: [
      `Close-up of artist`,
      `Wide performance shot`,
      `Studio session`,
      `Fan reactions`,
    ],
    musicNote: `Match ${ctx?.mood} atmosphere — ${ctx?.genre} tempo`,
    overlayTexts: [
      ctx?.artistName,
      ctx?.trackTitle ?? "New Drop",
      "Stream Now 🎵",
    ],
  };
}

function visualPromptFallback(ctx: GeneratorContext): VisualPrompt {
  const palette = ctx?.colorPalette.join(", ");
  return {
    imagePrompt: `A ${ctx?.mood} ${ctx?.genre} music promotional image for ${ctx?.artistName}. Color palette: ${palette}. Cinematic quality.`,
    thumbnailPrompt: `YouTube/social thumbnail for ${ctx?.artistName}. Bold typography, ${ctx?.mood} color scheme (${palette}).`,
    colorDirections: `Primary: ${ctx?.colorPalette[0] ?? "#1a1a2e"} | Accent: ${ctx?.colorPalette[2] ?? "#e94560"} | Background: ${ctx?.colorPalette[1] ?? "#16213e"}`,
    typographyNote: `Bold, modern sans-serif. Artist name: 48pt+. Track title: 36pt.`,
    moodBoard: [
      `${ctx?.mood} lighting`,
      `${ctx?.genre} aesthetic`,
      `Authentic, not over-produced`,
      `Color story: ${palette}`,
    ],
  };
}

function storySequenceFallback(ctx: GeneratorContext): StorySequence {
  return {
    frames: [
      {
        frameNumber: 1,
        durationSeconds: 5,
        text: `👀 You need to hear this`,
        visualNote: `Hook frame`,
      },
      {
        frameNumber: 2,
        durationSeconds: 7,
        text: `${ctx?.artistName} — ${ctx?.trackTitle ?? "New Music"}`,
        visualNote: `Artist photo`,
      },
      {
        frameNumber: 3,
        durationSeconds: 5,
        text: `${ctx?.mood} ${ctx?.genre} energy 🎵`,
        visualNote: `Lyric overlay`,
      },
      {
        frameNumber: 4,
        durationSeconds: 8,
        text: `What do you feel when you listen?`,
        visualNote: `Poll frame`,
        pollQuestion: `Does this song hit? 🔥 vs 💯`,
      },
      {
        frameNumber: 5,
        durationSeconds: 5,
        text: `Stream now — link in bio 🎶`,
        visualNote: `CTA frame`,
        stickerSuggestion: "link sticker",
      },
    ],
    totalDurationSeconds: 30,
  };
}

/**
 * Unwrap a PromiseSettledResult. If the promise was rejected, logs a warning
 * and returns the provided fallback value instead. This keeps `buildPlatformBundle`
 * readable — one line per generator instead of an inline comma-expression.
 */
function unwrapSettled<T>(
  result: PromiseSettledResult<T>,
  name: string,
  platform: SupportedPlatform,
  fallback: T,
): T {
  if (result?.status === "fulfilled") return result?.value;
  logger?.warn(
    `[UCO] ${name} rejected for ${platform}:`,
    (result as PromiseRejectedResult).reason,
  );
  return fallback;
}

async function buildPlatformBundle(
  platform: SupportedPlatform,
  genCtx: Omit<GeneratorContext, "platform">,
): Promise<PlatformContentBundle> {
  const ctx: GeneratorContext = { ...genCtx, platform };

  // Run all generators concurrently — use allSettled so one failure cannot
  // abort the others; each has a typed fallback that is always valid output.
  const [
    hooksResult,
    captionsResult,
    hashtagsResult,
    adCopyResult,
    videoScriptResult,
    visualPromptResult,
    storySequenceResult,
  ] = await Promise?.allSettled([
    generateHooks(ctx),
    generateCaptions(ctx),
    generateHashtags(ctx),
    generateAdCopy(ctx),
    generateVideoScript(ctx, 30),
    generateVisualPrompt(ctx),
    generateStorySequence(ctx),
  ]);

  const hooks = unwrapSettled(
    hooksResult,
    "generateHooks",
    platform,
    hooksFallback(ctx),
  );
  const captions = unwrapSettled(
    captionsResult,
    "generateCaptions",
    platform,
    captionsFallback(ctx),
  );
  const hashtags = unwrapSettled(hashtagsResult, "generateHashtags", platform, {
    niche: [],
    broad: [],
    trending: [],
    branded: [`#${ctx?.artistName.replace(/\s+/g, "")}`],
    combined: [`#${ctx?.artistName.replace(/\s+/g, "")}`, "#newmusic", "#music"],
  });
  const adCopy = unwrapSettled(
    adCopyResult,
    "generateAdCopy",
    platform,
    adCopyFallback(ctx),
  );
  const videoScript = unwrapSettled(
    videoScriptResult,
    "generateVideoScript",
    platform,
    videoScriptFallback(ctx),
  );
  const visualPrompt = unwrapSettled(
    visualPromptResult,
    "generateVisualPrompt",
    platform,
    visualPromptFallback(ctx),
  );
  const storySequence = unwrapSettled(
    storySequenceResult,
    "generateStorySequence",
    platform,
    storySequenceFallback(ctx),
  );

  const spec = PLATFORM_SPECS[platform];
  const formattedPosts: FormattedPost[] = [];

  for (const slot of spec?.supportedSlots) {
    // Pick the right caption length for this slot
    const rawBody =
      slot === "text_post" || slot === "thread"
        ? captions?.long
        : slot === "story" || slot === "google_post"
          ? captions?.short
          : captions?.medium;

    const { caption: finalCaption, firstComment } = assembleCaption(
      rawBody,
      hashtags?.combined,
      platform,
    );

    const visualSpec = getVisualSpec(platform, slot, genCtx?.colorPalette);

    formattedPosts?.push({
      platform,
      slot,
      finalCaption,
      firstComment,
      hashtags: enforceHashtagLimit(hashtags?.combined, platform),
      hook: hooks.primary,
      cta: adCopy.cta,
      visualSpec,
      adCopy: slot === "ad_banner" || slot === "ad_video" ? adCopy : undefined,
      rawContent: `${hooks?.primary}\n\n${finalCaption}`,
      source: "MaxCoreAI",
    });
  }

  return {
    platform,
    hooks,
    captions,
    hashtags,
    adCopy,
    videoScript,
    visualPrompt,
    storySequence,
    formattedPosts,
  };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

class UnifiedContentOrchestrator {
  /**
   * The single function to call to trigger full content generation for both
   * Max Booster and the artist in one request.
   *
   * @param input - BoostSheetInput or ArtistContextInput
   * @returns UnifiedContentPackage — a complete, production-ready content package
   */
  async generate(input: UnifiedContentInput): Promise<UnifiedContentPackage> {
    const runId = `ucr_${Date?.now()}_${Math?.random().toString(36).slice(2, 8)}`;
    const startTime = Date?.now();

    logger?.info(
      `[UnifiedContentOrchestrator] Starting run ${runId} — type=${input.type} artist="${input.artistName}" platforms=${(input?.platforms ?? ["tiktok", "instagram", "youtube", "twitter"]).join(",")}`,
    );

    const {
      artistCtx,
      generatorCtx,
      platforms,
      schedulingOptions,
      targetArtistSegment,
      campaignGoal,
    } = normalizeInput(input);

    // ── Step 1: Artist content generation ──────────────────────────────────
    logger?.info(
      `[UCO:${runId}] Step 1: Generating artist content across ${platforms?.length} platforms`,
    );
    const artistContent = generateAllArtistContent(artistCtx, platforms);

    // ── Step 2: Max Booster feature content generation ─────────────────────
    logger?.info(
      `[UCO:${runId}] Step 2: Generating Max Booster feature content`,
    );
    const maxBoosterContent = generateAllMaxBoosterContent(
      platforms,
      targetArtistSegment,
    );

    // ── Step 3: Per-platform content bundles (concurrent) ─────────────────
    // Use allSettled — one platform failing should never abort the others.
    logger?.info(
      `[UCO:${runId}] Step 3: Building platform bundles for [${platforms?.join(", ")}]`,
    );
    const bundleResults = await Promise?.allSettled(
      platforms?.map((platform) => buildPlatformBundle(platform, generatorCtx)),
    );
    const platformBundles: PlatformContentBundle[] = bundleResults
      .map((result, i) => {
        if (result?.status === "fulfilled") return result?.value;
        logger?.warn(
          `[UCO:${runId}] Platform bundle failed for ${platforms[i]}: ${(result as PromiseRejectedResult).reason}`,
        );
        return null;
      })
      .filter((b): b is PlatformContentBundle => b !== null);

    // ── Step 4: Collect all slot combinations for scheduling ───────────────
    logger?.info(`[UCO:${runId}] Step 4: Building schedule manifest`);
    const slots: Array<{ platform: SupportedPlatform; slot: ContentSlot }> =
      platformBundles?.flatMap((bundle) =>
        bundle?.formattedPosts.map((post) => ({
          platform: bundle.platform,
          slot: post.slot,
        })),
      );

    const scheduleManifest = buildScheduleManifest(slots, {
      platforms,
      campaignGoal,
      ...schedulingOptions,
      priorityPlatforms: platforms.slice(0, 2),
    });

    // ── Step 5: Build bulk-schedule payload ────────────────────────────────
    logger?.info(`[UCO:${runId}] Step 5: Assembling bulk-schedule payload`);
    const contentMap = new Map<
      string,
      { content: string; platform: SupportedPlatform }
    >();
    for (const bundle of platformBundles) {
      for (const post of bundle?.formattedPosts) {
        contentMap?.set(`${post?.platform}:${post?.slot}`, {
          content: post.rawContent,
          platform: post.platform,
        });
      }
    }
    const bulkSchedulePayload = manifestToBulkSchedulePayload(
      scheduleManifest,
      contentMap,
    );

    // ── Step 6: Push async jobs to PDIM for background processing ─────────
    logger?.info(`[UCO:${runId}] Step 6: Enqueuing PDIM background jobs`);
    await this?.enqueuePdimJobs(
      runId,
      input,
      platformBundles,
      scheduleManifest,
    ).catch((err) => {
      logger?.warn(
        `[UCO:${runId}] PDIM enqueue soft-failed (non-blocking): ${err?.message}`,
      );
    });

    const generationTimeMs = Date?.now() - startTime;

    const pkg: UnifiedContentPackage = {
      runId,
      generatedAt: new Date(),
      input,
      artistContent,
      maxBoosterContent,
      platformBundles,
      scheduleManifest,
      bulkSchedulePayload,
      stats: {
        totalPieces:
          artistContent?.length +
          maxBoosterContent?.length +
          platformBundles?.flatMap((b) => b?.formattedPosts).length,
        platformsGenerated: platforms.length,
        artistPieces: artistContent.length,
        maxBoosterPieces: maxBoosterContent.length,
        scheduledPosts: scheduleManifest.totalPostCount,
        generationTimeMs,
      },
    };

    logger?.info(
      `[UCO:${runId}] ✅ Complete — ${pkg?.stats.totalPieces} pieces, ${pkg?.stats.scheduledPosts} scheduled, ${generationTimeMs}ms`,
    );

    return pkg;
  }

  /**
   * Enqueues async PDIM jobs for post-processing: image rendering, approval
   * workflows, social platform sync, and autopilot queue injection.
   */
  private async enqueuePdimJobs(
    runId: string,
    input: UnifiedContentInput,
    bundles: PlatformContentBundle[],
    manifest: ScheduleManifest,
  ): Promise<void> {
    const jobs = [
      // Content approval workflow job
      {
        queue: "mbs:content:approval",
        payload: {
          runId,
          artistName: input.artistName,
          totalPosts: manifest.totalPostCount,
          manifestSummary: {
            start: manifest.campaignStart,
            end: manifest.campaignEnd,
            platforms: Object.keys(manifest?.platformBreakdown),
          },
        },
      },
      // Image/visual rendering job for each platform
      ...bundles?.map((bundle) => ({
        queue: "mbs:content:visual:render",
        payload: {
          runId,
          platform: bundle.platform,
          imagePrompt: bundle.visualPrompt.imagePrompt,
          thumbnailPrompt: bundle.visualPrompt.thumbnailPrompt,
          colorPalette: bundle.visualPrompt.colorDirections,
        },
      })),
      // Training feedback to MaxCore
      {
        queue: "mbs:training:feedback",
        payload: {
          runId,
          event: "content_generated",
          artistName: input.artistName,
          genre: input.genre,
          mood: input.mood,
          platforms: bundles.map((b) => b?.platform),
          timestamp: new Date().toISOString(),
        },
      },
    ];

    try {
      const redis = await getRedisClient();
      for (const job of jobs) {
        await redis
          .lpush(job?.queue, JSON?.stringify(job?.payload))
          .catch(() => null);
      }
      logger?.info(
        `[UCO:${runId}] Enqueued ${jobs?.length} PDIM background jobs`,
      );
    } catch (err) {
      logger?.warn(
        `[UCO:${runId}] Could not enqueue PDIM jobs: ${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Quick-generate a single platform bundle — useful for lightweight previews
   * or testing a single channel without running the full pipeline.
   */
  async generateForPlatform(
    input: UnifiedContentInput,
    platform: SupportedPlatform,
  ): Promise<PlatformContentBundle> {
    const { generatorCtx } = normalizeInput(input);
    return buildPlatformBundle(platform, generatorCtx);
  }

  /**
   * Re-generate only the artist content — useful after a new track is added
   * without needing to rebuild the entire Max Booster feature content.
   */
  async generateArtistContentOnly(
    input: UnifiedContentInput,
  ): Promise<ArtistContentPiece[]> {
    const { artistCtx, platforms } = normalizeInput(input);
    return generateAllArtistContent(artistCtx, platforms);
  }

  /**
   * Re-generate only the Max Booster feature content — useful for platform
   * marketing campaigns that don't involve a specific artist release.
   */
  async generateMaxBoosterContentOnly(
    input: UnifiedContentInput,
  ): Promise<MaxBoosterContentPiece[]> {
    const { platforms, targetArtistSegment } = normalizeInput(input);
    return generateAllMaxBoosterContent(platforms, targetArtistSegment);
  }
}

export const unifiedContentOrchestrator = new UnifiedContentOrchestrator();
