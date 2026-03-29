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

import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';

import {
  PLATFORM_SPECS,
  assembleCaption,
  getVisualSpec,
  enforceHashtagLimit,
  type SupportedPlatform,
  type ContentSlot,
  type FormattedContent,
  ALL_PLATFORMS,
} from './contentPipeline/platformFormatters.js';

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
} from './contentPipeline/contentTypeGenerators.js';

import {
  buildScheduleManifest,
  manifestToBulkSchedulePayload,
  type ScheduleManifest,
  type SchedulingOptions,
} from './contentPipeline/schedulingMetadataBuilder.js';

import {
  generateAllMaxBoosterContent,
  type MaxBoosterContentPiece,
  type MaxBoosterContentContext,
} from './contentPipeline/maxBoosterContentStrategy.js';

import {
  generateAllArtistContent,
  type ArtistContext,
  type ArtistContentPiece,
} from './contentPipeline/artistContentStrategy.js';

// ─── Root Input Types ─────────────────────────────────────────────────────────

/**
 * BoostSheet input — use when triggering from an existing BoostSheet record.
 * Fields map directly to the BoostSheetResult interface in pythonAIService.ts.
 */
export interface BoostSheetInput {
  type: 'boostsheet';
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
  brandVoice?: GeneratorContext['brandVoice'];
  colorPalette?: string[];
  targetAudience?: string;
  keywords?: string[];
  campaignGoal?: GeneratorContext['campaignGoal'];
  platforms?: SupportedPlatform[];
  collaborators?: string[];
  upcomingEvents?: ArtistContext['upcomingEvents'];
  socialHandles?: Partial<Record<SupportedPlatform, string>>;
  targetArtistSegment?: MaxBoosterContentContext['targetArtistSegment'];
  schedulingOptions?: Partial<SchedulingOptions>;
}

/**
 * ArtistContextInput — use when triggering directly from artist profile data.
 */
export interface ArtistContextInput {
  type: 'artist_context';
  artistName: string;
  genre: string;
  mood: string;
  trackTitle?: string;
  releaseDate?: string;
  albumTitle?: string;
  bio?: string;
  streamingLinks?: Partial<Record<string, string>>;
  brandVoice?: GeneratorContext['brandVoice'];
  colorPalette?: string[];
  targetAudience?: string;
  keywords?: string[];
  campaignGoal?: GeneratorContext['campaignGoal'];
  platforms?: SupportedPlatform[];
  collaborators?: string[];
  upcomingEvents?: ArtistContext['upcomingEvents'];
  socialHandles?: Partial<Record<SupportedPlatform, string>>;
  targetArtistSegment?: MaxBoosterContentContext['targetArtistSegment'];
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
  bulkSchedulePayload: Array<{ platform: string; content: string; scheduledAt: string }>;

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
  generatorCtx: Omit<GeneratorContext, 'platform'>;
  platforms: SupportedPlatform[];
  schedulingOptions: Partial<SchedulingOptions>;
  targetArtistSegment: MaxBoosterContentContext['targetArtistSegment'];
  campaignGoal: GeneratorContext['campaignGoal'];
} {
  const colorPalette = input.colorPalette ?? ['#1a1a2e', '#16213e', '#0f3460', '#e94560'];
  const brandVoice = input.brandVoice ?? 'energetic';
  const targetAudience = input.targetAudience ?? 'music fans aged 18–35';
  const keywords = input.keywords ?? [input.genre, input.mood, input.artistName];
  const campaignGoal = input.campaignGoal ?? 'growth';
  const platforms: SupportedPlatform[] = input.platforms ?? ['tiktok', 'instagram', 'youtube', 'twitter'];
  const targetArtistSegment = input.targetArtistSegment ?? 'emerging_artist';

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

  const generatorCtx: Omit<GeneratorContext, 'platform'> = {
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

async function buildPlatformBundle(
  platform: SupportedPlatform,
  genCtx: Omit<GeneratorContext, 'platform'>,
): Promise<PlatformContentBundle> {
  const ctx: GeneratorContext = { ...genCtx, platform };

  // Run all generators for this platform concurrently
  const [hooks, captions, hashtags, adCopy, videoScript, visualPrompt, storySequence] =
    await Promise.all([
      generateHooks(ctx),
      generateCaptions(ctx),
      generateHashtags(ctx),
      generateAdCopy(ctx),
      generateVideoScript(ctx, 30),
      generateVisualPrompt(ctx),
      generateStorySequence(ctx),
    ]);

  const spec = PLATFORM_SPECS[platform];
  const formattedPosts: FormattedPost[] = [];

  for (const slot of spec.supportedSlots) {
    // Pick the right caption length for this slot
    const rawBody = slot === 'text_post' || slot === 'thread'
      ? captions.long
      : slot === 'story' || slot === 'canvas_loop'
      ? captions.short
      : captions.medium;

    const { caption: finalCaption, firstComment } = assembleCaption(
      rawBody,
      hashtags.combined,
      platform,
    );

    const visualSpec = getVisualSpec(platform, slot, genCtx.colorPalette);

    formattedPosts.push({
      platform,
      slot,
      finalCaption,
      firstComment,
      hashtags: enforceHashtagLimit(hashtags.combined, platform),
      hook: hooks.primary,
      cta: adCopy.cta,
      visualSpec,
      adCopy: slot === 'ad_banner' || slot === 'ad_video' ? adCopy : undefined,
      rawContent: `${hooks.primary}\n\n${finalCaption}`,
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
    const runId = `ucr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    logger.info(`[UnifiedContentOrchestrator] Starting run ${runId} — type=${input.type} artist="${input.artistName}" platforms=${(input.platforms ?? ['tiktok','instagram','youtube','twitter']).join(',')}`);

    const { artistCtx, generatorCtx, platforms, schedulingOptions, targetArtistSegment, campaignGoal } =
      normalizeInput(input);

    // ── Step 1: Artist content generation ──────────────────────────────────
    logger.info(`[UCO:${runId}] Step 1: Generating artist content across ${platforms.length} platforms`);
    const artistContent = generateAllArtistContent(artistCtx, platforms);

    // ── Step 2: Max Booster feature content generation ─────────────────────
    logger.info(`[UCO:${runId}] Step 2: Generating Max Booster feature content`);
    const maxBoosterContent = generateAllMaxBoosterContent(platforms, targetArtistSegment);

    // ── Step 3: Per-platform content bundles (concurrent) ─────────────────
    logger.info(`[UCO:${runId}] Step 3: Building platform bundles for [${platforms.join(', ')}]`);
    const platformBundles = await Promise.all(
      platforms.map(platform => buildPlatformBundle(platform, generatorCtx)),
    );

    // ── Step 4: Collect all slot combinations for scheduling ───────────────
    logger.info(`[UCO:${runId}] Step 4: Building schedule manifest`);
    const slots: Array<{ platform: SupportedPlatform; slot: ContentSlot }> = platformBundles.flatMap(
      bundle => bundle.formattedPosts.map(post => ({ platform: bundle.platform, slot: post.slot })),
    );

    const scheduleManifest = buildScheduleManifest(slots, {
      platforms,
      campaignGoal,
      ...schedulingOptions,
      priorityPlatforms: platforms.slice(0, 2),
    });

    // ── Step 5: Build bulk-schedule payload ────────────────────────────────
    logger.info(`[UCO:${runId}] Step 5: Assembling bulk-schedule payload`);
    const contentMap = new Map<string, { content: string; platform: SupportedPlatform }>();
    for (const bundle of platformBundles) {
      for (const post of bundle.formattedPosts) {
        contentMap.set(`${post.platform}:${post.slot}`, {
          content: post.rawContent,
          platform: post.platform,
        });
      }
    }
    const bulkSchedulePayload = manifestToBulkSchedulePayload(scheduleManifest, contentMap);

    // ── Step 6: Push async jobs to PDIM for background processing ─────────
    logger.info(`[UCO:${runId}] Step 6: Enqueuing PDIM background jobs`);
    await this.enqueuePdimJobs(runId, input, platformBundles, scheduleManifest).catch(err => {
      logger.warn(`[UCO:${runId}] PDIM enqueue soft-failed (non-blocking): ${err?.message}`);
    });

    const generationTimeMs = Date.now() - startTime;

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
        totalPieces: artistContent.length + maxBoosterContent.length + platformBundles.flatMap(b => b.formattedPosts).length,
        platformsGenerated: platforms.length,
        artistPieces: artistContent.length,
        maxBoosterPieces: maxBoosterContent.length,
        scheduledPosts: scheduleManifest.totalPostCount,
        generationTimeMs,
      },
    };

    logger.info(
      `[UCO:${runId}] ✅ Complete — ${pkg.stats.totalPieces} pieces, ${pkg.stats.scheduledPosts} scheduled, ${generationTimeMs}ms`,
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
        queue: 'mbs:content:approval',
        payload: {
          runId,
          artistName: input.artistName,
          totalPosts: manifest.totalPostCount,
          manifestSummary: {
            start: manifest.campaignStart,
            end: manifest.campaignEnd,
            platforms: Object.keys(manifest.platformBreakdown),
          },
        },
      },
      // Image/visual rendering job for each platform
      ...bundles.map(bundle => ({
        queue: 'mbs:content:visual:render',
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
        queue: 'mbs:training:feedback',
        payload: {
          runId,
          event: 'content_generated',
          artistName: input.artistName,
          genre: input.genre,
          mood: input.mood,
          platforms: bundles.map(b => b.platform),
          timestamp: new Date().toISOString(),
        },
      },
    ];

    try {
      const redis = await getRedisClient();
      for (const job of jobs) {
        await redis.lpush(job.queue, JSON.stringify(job.payload)).catch(() => null);
      }
      logger.info(`[UCO:${runId}] Enqueued ${jobs.length} PDIM background jobs`);
    } catch (err) {
      logger.warn(`[UCO:${runId}] Could not enqueue PDIM jobs: ${(err as Error)?.message}`);
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
