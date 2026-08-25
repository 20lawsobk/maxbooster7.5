/**
 * Content Type Generators
 *
 * Modular generators for every content type the unified pipeline produces.
 * Each generator accepts a shared context and returns fully-formed output for
 * its specific content type. All generation routes through MaxCore → Python AI
 * → in-house JS fallback, exactly matching the existing UnifiedAIController
 * priority chain.
 *
 * Content types: captions, hooks, ad copy, video scripts, hashtag sets,
 * visual prompts, story sequences.
 */

import { MaxCoreAIClient } from "../unifiedAIController.js";
import { requireMaxCore, AIUnavailableError } from "../../lib/aiSource.js";
import {
  getAwarenessContext,
  normalizeSocialAwarenessPlatform,
  platformAwarenessOptimization,
} from "../awarenessContext.js";
import type { SupportedPlatform } from "./platformFormatters.js";

// ─── Shared Context ───────────────────────────────────────────────────────────

export interface GeneratorContext {
  artistName: string;
  genre: string;
  mood: string;
  trackTitle?: string;
  releaseDate?: string;
  brandVoice:
    | "professional"
    | "casual"
    | "energetic"
    | "creative"
    | "promotional";
  colorPalette: string[];
  targetAudience: string;
  campaignGoal: "awareness" | "engagement" | "conversion" | "growth";
  keywords: string[];
  avoidTopics: string[];
  platform: SupportedPlatform;
  /** Extra freeform context injected by the calling strategy */
  extraContext?: string;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface HookSet {
  primary: string;
  alternates: string[];
  questionHook: string;
  statementHook: string;
  cliffhangerHook: string;
}

export interface CaptionSet {
  short: string;
  medium: string;
  long: string;
  platform: SupportedPlatform;
}

export interface HashtagSet {
  niche: string[];
  broad: string[];
  trending: string[];
  branded: string[];
  combined: string[];
}

export interface AdCopySet {
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  disclaimer?: string;
  variants: Array<{ headline: string; body: string; cta: string }>;
}

export interface VideoScript {
  hook: string;
  body: string[];
  cta: string;
  durationHint: string;
  bRoll: string[];
  musicNote: string;
  overlayTexts: string[];
}

export interface VisualPrompt {
  imagePrompt: string;
  thumbnailPrompt: string;
  colorDirections: string;
  typographyNote: string;
  moodBoard: string[];
}

export interface StorySequence {
  frames: StoryFrame[];
  totalDurationSeconds: number;
}

export interface StoryFrame {
  frameNumber: number;
  durationSeconds: number;
  text: string;
  visualNote: string;
  stickerSuggestion?: string;
  pollQuestion?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
//
// /api/generate/content is a structured caption composer, NOT a freeform
// instruction-follower: `topic` is always templated raw into the hook/body
// text server-side (see MaxCore server.py api_generate_content — "idea stays
// a clean topic string; it is templated raw into hook/body text"). Creative
// direction belongs in `instruction`/`extra_context`, which feed the real
// awareness-conditioned ScriptAgent (`effective_awareness` → `_script_agent`).
// Earlier revisions of this module stuffed multi-paragraph instructions into
// `topic` and tried to parse the response by section headers — that never
// worked; MaxCore ignored the instructions and returned its literal caption
// template. Every generator below now sends a short, clean `topic` plus a
// real `instruction`, and reads MaxCore's actual hook/body/cta/variants
// fields instead of hallucinated section markers.

/** Short, clean topic string — no quotes (MaxCore hashtagifies the raw topic,
 * so stray punctuation becomes junk tags like `#"Title"byArtist`). */
function buildTopic(ctx: GeneratorContext): string {
  return ctx?.trackTitle
    ? `${ctx.trackTitle} by ${ctx?.artistName}`
    : `${ctx?.artistName} new ${ctx?.genre} release`;
}

interface StructuredMaxCoreResult {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  variants: Array<{ hook: string; body: string; cta: string }>;
}

async function callMaxCoreStructured(
  ctx: GeneratorContext,
  opts: {
    topic: string;
    instruction: string;
    variants?: number;
    maxChars?: number;
    includeHashtags?: boolean;
  },
  featureLabel: string,
): Promise<StructuredMaxCoreResult> {
  const payload: Record<string, unknown> = {
    topic: opts.topic,
    platform: ctx.platform,
    tone: ctx.brandVoice,
    genre: ctx.genre,
    artist_name: ctx.artistName,
    brand_voice: ctx.brandVoice,
    target_audience: ctx.targetAudience,
    instruction: opts.instruction,
  };

  // Route through the shared awareness layer (live trend/platform signals)
  // instead of relying solely on locally-passed context — every other
  // MaxCore content-generation call site does this via
  // unifiedAIController/advancedSocialAIService, and this pipeline was the
  // one gap that skipped it.
  let platformOptimization: string | null = null;
  try {
    const canonicalPlatform = normalizeSocialAwarenessPlatform(ctx.platform);
    platformOptimization = platformAwarenessOptimization(canonicalPlatform);
  } catch {
    // Platform outside the closed optimization set (e.g. an internal-only
    // platform value) — proceed without platform-specific formatting rather
    // than failing generation.
  }
  const awareness = await getAwarenessContext("content");
  const extraContextParts: string[] = [];
  if (ctx.extraContext) extraContextParts.push(ctx.extraContext);
  if (awareness?.contextString) extraContextParts.push(awareness.contextString);
  if (platformOptimization) extraContextParts.push(platformOptimization);
  if (extraContextParts.length) payload.extra_context = extraContextParts.join("\n\n");
  if (awareness) {
    payload.awareness = {
      trendingGenres: awareness.trendingGenres,
      trendingMoods: awareness.trendingMoods,
      contentAngles: awareness.contentAngles,
      ctaPatterns: awareness.ctaPatterns,
      emotionalTriggers: awareness.emotionalTriggers,
      platformAlgorithmNotes: awareness.platformAlgorithmNotes,
    };
  }
  // Keywords are thematic direction, NOT ready-made hashtags — MaxCore echoes
  // preferred_hashtags verbatim into its hashtag output, so raw keywords like
  // "hip-hop" would surface as malformed tags. content_themes is the designed
  // channel: themes feed the awareness bridge as bullets, never as #tags.
  if (ctx.keywords.length) payload.content_themes = ctx?.keywords;
  if (ctx.avoidTopics.length) payload.avoid_topics = ctx?.avoidTopics;
  if (ctx.trackTitle) payload.track_title = ctx?.trackTitle;
  if (ctx.releaseDate) payload.release_date = ctx?.releaseDate;
  if (opts.variants && opts.variants > 1) payload.variants = opts.variants;
  if (opts.maxChars) payload.max_chars = opts.maxChars;
  if (opts.includeHashtags != null)
    payload.include_hashtags = opts.includeHashtags;

  const result = await MaxCoreAIClient?.infer<{
    caption?: string;
    hook?: string;
    body?: string;
    cta?: string;
    hashtags?: string[];
    variants?: Array<{ hook?: string; body?: string; cta?: string }>;
  }>("/api/generate/content", payload);

  // MaxCore is the ONLY source — throw explicitly (HTTP 503) when it returns
  // nothing rather than letting callers substitute local fallback content.
  const hook = requireMaxCore(result?.hook || null, featureLabel);
  const rawVariants =
    Array.isArray(result?.variants) && result.variants.length
      ? result.variants
      : [{ hook, body: result?.body, cta: result?.cta }];

  return {
    hook,
    body: result?.body ?? "",
    cta: result?.cta ?? "",
    caption: result?.caption ?? "",
    hashtags: Array.isArray(result?.hashtags) ? result.hashtags : [],
    variants: rawVariants.map((v) => ({
      hook: v?.hook ?? "",
      body: v?.body ?? "",
      cta: v?.cta ?? "",
    })),
  };
}

// ─── Hook Generator ──────────────────────────────────────────────────────────

export async function generateHooks(ctx: GeneratorContext): Promise<HookSet> {
  const topic = buildTopic(ctx);

  // MaxCore's composer picks ONE hook per request (variants differ only by
  // body), so distinct hooks require distinct requests — each with a
  // different creative angle. Angles are phrased as content direction, not
  // meta-instructions ("write a…"), because the direction text conditions the
  // awareness bridge and can surface in the copy itself.
  const [main, question, statement, cliffhanger] = await Promise.all([
    callMaxCoreStructured(
      ctx,
      { topic, instruction: `${ctx?.mood} energy, scroll-stopping first 3 seconds, ${ctx?.campaignGoal} focus` },
      "hook generation (primary)",
    ),
    callMaxCoreStructured(
      ctx,
      { topic, instruction: `curiosity — a question fans can't scroll past` },
      "hook generation (question)",
    ),
    callMaxCoreStructured(
      ctx,
      { topic, instruction: `bold, definitive statement — confidence and swagger` },
      "hook generation (statement)",
    ),
    callMaxCoreStructured(
      ctx,
      { topic, instruction: `cliffhanger tease — what happens next stays unsaid` },
      "hook generation (cliffhanger)",
    ),
  ]);

  // MaxCore's hook ranker is deterministic and the awareness pool's top hook
  // often wins across angles — dedupe so alternates never repeat the primary.
  // Fewer unique alternates is honest; duplicating them is not.
  const alternates = [
    ...new Set(
      [question.hook, statement.hook, cliffhanger.hook].filter(
        (h) => h && h !== main.hook,
      ),
    ),
  ];

  return {
    primary: main.hook,
    alternates,
    questionHook: question.hook,
    statementHook: statement.hook,
    cliffhangerHook: cliffhanger.hook,
  };
}

// ─── Caption Generator ───────────────────────────────────────────────────────

export async function generateCaptions(
  ctx: GeneratorContext,
): Promise<CaptionSet> {
  const topic = buildTopic(ctx);

  // Three separate calls (rather than parsing one blob into sections) so each
  // length tier is a real MaxCore caption, trimmed server-side via max_chars.
  // Instructions read as creative angles, never "write a…" meta-directives —
  // direction text conditions the awareness bridge and can appear in copy.
  const [shortRes, mediumRes, longRes] = await Promise.all([
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `punchy high-impact energy, ${ctx?.brandVoice} tone`,
        maxChars: 80,
      },
      "caption generation (short)",
    ),
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `a story moment behind the music, ${ctx?.brandVoice} tone, ${ctx?.campaignGoal} focus`,
        maxChars: 200,
      },
      "caption generation (medium)",
    ),
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `emotional depth and connection with fans, ${ctx?.brandVoice} tone, ${ctx?.campaignGoal} focus`,
        maxChars: 400,
      },
      "caption generation (long)",
    ),
  ]);

  return {
    short: requireMaxCore(shortRes.caption || shortRes.hook || null, "caption generation (short)"),
    medium: requireMaxCore(mediumRes.caption || mediumRes.hook || null, "caption generation (medium)"),
    long: requireMaxCore(longRes.caption || longRes.hook || null, "caption generation (long)"),
    platform: ctx.platform,
  };
}

// ─── Hashtag Generator ───────────────────────────────────────────────────────

// Hashtags that are common platform-generic discovery tags rather than
// genre/niche-specific — used only to BUCKET MaxCore's own returned tags
// into categories, never to fabricate new ones.
const TRENDING_GENERIC_TAGS = new Set([
  "#fyp", "#foryou", "#foryoupage", "#viral", "#trending", "#explore",
  "#explorepage", "#reels", "#reelsinstagram", "#instareels", "#shorts",
]);

export async function generateHashtags(
  ctx: GeneratorContext,
): Promise<HashtagSet> {
  const branded = [`#${ctx?.artistName.replace(/\s+/g, "")}`, `#MaxBooster`];
  const topic = buildTopic(ctx);

  // MaxCore's distribution agent returns hashtags conditioned on the real
  // awareness/genre/platform signals — bucket those (don't invent new ones).
  const result = await callMaxCoreStructured(
    ctx,
    {
      topic,
      instruction: `${ctx?.mood} ${ctx?.genre} discovery reach, ${ctx?.campaignGoal} focus`,
      includeHashtags: true,
    },
    "hashtag generation",
  );

  // Keep only well-formed tags — MaxCore echoes preferred_hashtags verbatim
  // and hashtagifies the raw topic, which can produce malformed entries.
  const cleaned = result.hashtags
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .map((t) => `#${t.slice(1).replace(/[^\p{L}\p{N}_]/gu, "")}`)
    .filter((t) => t.length > 1);
  const aiTags = requireMaxCore(
    cleaned.length ? [...new Set(cleaned)] : null,
    "hashtag generation",
  );

  const genreKey = ctx?.genre?.toLowerCase().replace(/\s+/g, "");
  const artistKey = ctx?.artistName?.toLowerCase().replace(/\s+/g, "");
  const trending = aiTags.filter((t) => TRENDING_GENERIC_TAGS.has(t.toLowerCase()));
  const niche = aiTags.filter(
    (t) =>
      !trending.includes(t) &&
      (t.toLowerCase().includes(genreKey) || t.toLowerCase().includes(artistKey)),
  );
  const broad = aiTags.filter((t) => !trending.includes(t) && !niche.includes(t));

  const combined = [...branded, ...aiTags].slice(0, 30);

  return { niche, broad, trending, branded, combined };
}

// ─── Ad Copy Generator ───────────────────────────────────────────────────────

export async function generateAdCopy(
  ctx: GeneratorContext,
): Promise<AdCopySet> {
  const topic = buildTopic(ctx);

  // hook → headline, first sentence of body → subheadline, full body → body,
  // cta → cta. 3 variants give the primary + 2 A/B angles (variants differ by
  // body, sharing the hook — MaxCore composer behavior), all MaxCore-real.
  const result = await callMaxCoreStructured(
    ctx,
    {
      topic,
      instruction: `high-converting ad angle, clear value for ${ctx?.targetAudience}, ${ctx?.campaignGoal} focus`,
      variants: 3,
    },
    "ad copy generation",
  );

  const toVariant = (v: { hook: string; body: string; cta: string }) => ({
    headline: v.hook.slice(0, 40),
    subheadline: (v.body.split(/(?<=[.!?])\s+/)[0] ?? "").slice(0, 80),
    body: v.body.slice(0, 150),
    cta: v.cta.slice(0, 20),
  });

  const [primary, ...rest] = result.variants;
  const primaryAd = toVariant(primary ?? { hook: result.hook, body: result.body, cta: result.cta });

  return {
    headline: primaryAd.headline,
    subheadline: primaryAd.subheadline,
    body: primaryAd.body,
    cta: primaryAd.cta,
    variants: rest.slice(0, 2).map((v) => {
      const built = toVariant(v);
      return { headline: built.headline, body: built.body, cta: built.cta };
    }),
  };
}

// ─── Video Script Generator ──────────────────────────────────────────────────

export async function generateVideoScript(
  ctx: GeneratorContext,
  durationSeconds: 15 | 30 | 60 | 180 = 30,
): Promise<VideoScript> {
  const topic = buildTopic(ctx);

  // Every field is its own MaxCore call — no section-header parsing of a
  // single free-form blob (MaxCore doesn't produce that format). Variants
  // share one hook and differ by BODY, so list-type fields (b-roll, overlays)
  // read variant bodies, not hooks.
  const [main, broll, note, overlay] = await Promise.all([
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `${durationSeconds}-second video moment, ${ctx?.mood} mood, ${ctx?.campaignGoal} focus`,
      },
      "video script (script)",
    ),
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `cinematic ${ctx?.mood} visuals — studio moments, city nights, performance energy`,
        variants: 4,
      },
      "video script (b-roll)",
    ),
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `the tempo and energy of the edit — pacing, cuts, momentum`,
      },
      "video script (music note)",
    ),
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `short punchy on-screen text moments`,
        variants: 3,
      },
      "video script (overlay texts)",
    ),
  ]);

  const body = main.body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const bRoll = [...new Set(broll.variants.map((v) => v.body).filter(Boolean))];
  const overlayTexts = [
    overlay.hook,
    ...overlay.variants.slice(1).map((v) => v.body),
  ].filter(Boolean);

  return {
    hook: requireMaxCore(main.hook || null, "video script (hook)"),
    body: requireMaxCore(body.length ? body : null, "video script (body)"),
    cta: requireMaxCore(main.cta || null, "video script (cta)"),
    durationHint: `${durationSeconds}s`,
    bRoll: requireMaxCore(bRoll.length ? bRoll : null, "video script (b-roll)"),
    musicNote: requireMaxCore(note.hook || null, "video script (music note)"),
    overlayTexts: requireMaxCore(
      overlayTexts.length ? overlayTexts : null,
      "video script (overlay texts)",
    ),
  };
}

// ─── Visual Prompt Generator ─────────────────────────────────────────────────

export async function generateVisualPrompt(
  ctx: GeneratorContext,
): Promise<VisualPrompt> {
  const palette = ctx?.colorPalette.join(", ");
  const topic = buildTopic(ctx);

  // Source the creative copy from MaxCore's awareness-conditioned generation —
  // only the deterministic spec fields (colors, typography) are assembled
  // locally, since those are fixed brand rules, not generated content.
  const [image, thumbnail] = await Promise.all([
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `cinematic promotional imagery, ${ctx?.mood} mood, color palette ${palette}`,
      },
      "visual prompt generation (image)",
    ),
    callMaxCoreStructured(
      ctx,
      {
        topic,
        instruction: `bold thumbnail imagery, artist name prominent, ${ctx?.mood} mood, color palette ${palette}`,
      },
      "visual prompt generation (thumbnail)",
    ),
  ]);

  const imagePrompt = image.body || image.hook;
  const thumbnailPrompt = thumbnail.body || thumbnail.hook;
  if (!imagePrompt || !thumbnailPrompt) {
    throw new AIUnavailableError("visual prompt generation");
  }

  return {
    imagePrompt,
    thumbnailPrompt,
    colorDirections: `Primary: ${ctx?.colorPalette[0] ?? "#1a1a2e"} | Accent: ${ctx?.colorPalette[2] ?? "#e94560"} | Background: ${ctx?.colorPalette[1] ?? "#16213e"}`,
    typographyNote: `Bold, modern sans-serif. Artist name: 48pt+. Track title: 36pt. All caps for impact.`,
    moodBoard: [
      `${ctx?.mood} lighting — deep shadows, dramatic contrast`,
      `${ctx?.genre} aesthetic — reference iconic artists in the genre`,
      `Authentic, not over-produced`,
      `Color story: ${palette}`,
    ],
  };
}

// ─── Story Sequence Generator ─────────────────────────────────────────────────

export async function generateStorySequence(
  ctx: GeneratorContext,
): Promise<StorySequence> {
  const topic = buildTopic(ctx);

  // Each frame has a distinct creative purpose, so each gets its own
  // instruction (phrased as a creative angle) rather than trying to parse
  // 5 frames out of one response.
  const frameInstructions = [
    `instant stop-scroll impact`,
    `the artist and the track, front and center`,
    `${ctx?.mood} emotion, raw and real`,
    `fan engagement — a this-or-that moment`,
    `clear next step for fans, ${ctx?.campaignGoal} focus`,
  ];

  const results = await Promise.all(
    frameInstructions.map((instruction, i) =>
      callMaxCoreStructured(
        ctx,
        { topic, instruction },
        `story sequence generation (frame ${i + 1})`,
      ),
    ),
  );
  const aiLines = results.map((r) => r.hook).filter(Boolean);

  // MaxCore-only contract: never fill missing frames with local template copy.
  if (aiLines.length < 5) {
    throw new AIUnavailableError("story sequence generation");
  }

  const frames: StoryFrame[] = [
    {
      frameNumber: 1,
      durationSeconds: 5,
      text: aiLines[0],
      visualNote: `Hook frame — bold text on ${ctx?.colorPalette[0] ?? "dark"} background`,
      stickerSuggestion: "music note gif sticker",
    },
    {
      frameNumber: 2,
      durationSeconds: 7,
      text: aiLines[1],
      visualNote: `Artist photo/branding — ${ctx?.mood} filter applied`,
      stickerSuggestion: "countdown sticker if pre-release",
    },
    {
      frameNumber: 3,
      durationSeconds: 5,
      text: aiLines[2],
      visualNote: `Lyric or waveform visual overlay`,
    },
    {
      frameNumber: 4,
      durationSeconds: 8,
      text: aiLines[3],
      visualNote: `Poll or question interaction frame`,
      pollQuestion: aiLines[3],
    },
    {
      frameNumber: 5,
      durationSeconds: 5,
      text: aiLines[4],
      visualNote: `CTA frame — swipe-up prompt, bright accent color`,
      stickerSuggestion: "link sticker",
    },
  ];

  return {
    frames,
    totalDurationSeconds: frames.reduce((sum, f) => sum + f?.durationSeconds, 0),
  };
}
