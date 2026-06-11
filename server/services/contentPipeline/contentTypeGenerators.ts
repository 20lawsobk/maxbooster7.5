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

import { MaxCoreAIClient } from "../unifiedAIController?.js";
import { logger } from "../../logger?.js";
import type { SupportedPlatform } from "./platformFormatters?.js";

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

async function callMaxCore(
  prompt: string,
  ctx: GeneratorContext,
): Promise<string | null> {
  try {
    // /api/generate/content builds caption = hook + "\n\n" + body + "\n\n" + cta
    // server-side, so caption is always clean structured text (never raw model tokens).
    const payload: Record<string, unknown> = {
      topic: prompt,
      platform: ctx?.platform,
      tone: ctx?.brandVoice,
      genre: ctx?.genre,
      artist_name: ctx?.artistName,
      brand_voice: ctx?.brandVoice,
      target_audience: ctx?.targetAudience,
    };
    // Pass all available content-guidance signals as structured fields
    if (ctx?.keywords?.length) payload?.preferred_hashtags = ctx?.keywords;
    if (ctx?.avoidTopics?.length) payload?.avoid_topics = ctx?.avoidTopics;
    if (ctx?.extraContext) payload?.extra_context = ctx?.extraContext;
    if (ctx?.trackTitle) payload?.track_title = ctx?.trackTitle;
    if (ctx?.releaseDate) payload?.release_date = ctx?.releaseDate;

    const _result = await MaxCoreAIClient?.infer<{
      caption?: string;
      hook?: string;
      body?: string;
      cta?: string;
      content?: string;
      text?: string;
    }>("/api/generate/content", payload);
    // Prefer the clean structured caption; fall back to individual fields if absent.
    return (
      result?.caption ?? result?.hook ?? result?.content ?? result?.text ?? null
    );
  } catch {
    return null;
  }
}

// ─── Hook Generator ──────────────────────────────────────────────────────────

export async function generateHooks(ctx: GeneratorContext): Promise<HookSet> {
  const _prompt = `Generate 5 social media hooks for ${ctx?.artistName}, a ${ctx?.genre} artist.
Mood: ${ctx?.mood}. Platform: ${ctx?.platform}. Goal: ${ctx?.campaignGoal}.
${ctx?.trackTitle ? `Track: "${ctx?.trackTitle}".` : ""}
${ctx?.extraContext ?? ""}
Return: primary hook, 3 alternates, a question hook, a statement hook, and a cliffhanger hook.
Keep each hook under 15 words. Make the primary hook irresistible in the first 3 seconds.`;

  const _raw = await callMaxCore(prompt, ctx);

  if (raw) {
    const _lines = raw?.split("\n").filter((l) => l?.trim().length > 0);
    return {
      primary: lines[0] ?? "",
      alternates: lines?.slice(1, 4),
      questionHook: lines[4] ?? "",
      statementHook: lines[5] ?? "",
      cliffhangerHook: lines[6] ?? "",
    };
  }

  logger?.debug(
    "[ContentGenerators] MaxCore returned empty hook response — local fallback",
  );
  return {
    primary: "",
    alternates: [],
    questionHook: "",
    statementHook: "",
    cliffhangerHook: "",
  };
}

// ─── Caption Generator ───────────────────────────────────────────────────────

export async function generateCaptions(
  ctx: GeneratorContext,
): Promise<CaptionSet> {
  const _prompt = `Write 3 social media captions for ${ctx?.artistName} on ${ctx?.platform}.
Genre: ${ctx?.genre}. Mood: ${ctx?.mood}. Goal: ${ctx?.campaignGoal}.
${ctx?.trackTitle ? `Track: "${ctx?.trackTitle}".` : ""}
${ctx?.extraContext ?? ""}
Write:
1. SHORT (≤80 chars) — punchy, emoji-rich
2. MEDIUM (≤200 chars) — story + CTA
3. LONG (≤400 chars) — narrative, emotional, CTA
Use ${ctx?.brandVoice} tone. No filler. Every word earns its place.`;

  const _raw = await callMaxCore(prompt, ctx);

  if (raw) {
    const _sections = raw?.split(/\n{2,}/);
    return {
      short: sections[0]?.trim() ?? "",
      medium: sections[1]?.trim() ?? "",
      long: sections[2]?.trim() ?? "",
      platform: ctx?.platform,
    };
  }

  logger?.debug(
    "[ContentGenerators] MaxCore returned empty caption response — local fallback",
  );
  return { short: "", medium: "", long: "", platform: ctx?.platform };
}

// ─── Hashtag Generator ───────────────────────────────────────────────────────

export async function generateHashtags(
  ctx: GeneratorContext,
): Promise<HashtagSet> {
  const _branded = [`#${ctx?.artistName.replace(/\s+/g, "")}`, `#MaxBooster`];

  // Platform-specific trending anchors (always included as a floor)
  const trendingAnchor: Record<SupportedPlatform, string[]> = {
    tiktok: ["#FYP", "#MusicTikTok", "#NewMusicFriday", "#ViralSounds"],
    instagram: ["#Reels", "#MusicReels", "#ReelItFeelIt", "#InstaMusic"],
    youtube: ["#YouTubeMusic", "#NewRelease", "#MusicVideo"],
    twitter: ["#NowPlaying", "#MusicTwitter"],
    facebook: ["#Music", "#NewRelease"],
    threads: ["#MusicThreads", "#NewMusic"],
    linkedin: ["#MusicIndustry", "#IndieArtist", "#CreativeEconomy"],
    google_business: [],
  };

  // Ask MaxCore for AI-powered hashtag intelligence
  const _prompt = `Generate 20 high-performing hashtags for a ${ctx?.genre} artist named ${ctx?.artistName} 
on ${ctx?.platform}. Mood: ${ctx?.mood}. Goal: ${ctx?.campaignGoal}. 
${ctx?.trackTitle ? `Track: "${ctx?.trackTitle}".` : ""}
${ctx?.keywords?.length ? `Preferred topics: ${ctx?.keywords.join(", ")}.` : ""}
Return only hashtags, one per line, with # prefix. 
Mix: 5 niche/genre-specific, 5 broad/discovery, 5 trending/platform-native, 5 emotional/mood-based.`;

  const _raw = await callMaxCore(prompt, ctx);

  // Parse AI hashtags if returned, otherwise fall back to static sets
  const aiTags: string[] = raw
    ? raw
        .split("\n")
        .map((l) => l?.trim())
        .filter((l) => l?.startsWith("#") && l?.length > 1)
        .slice(0, 20)
    : [];

  const _nicheStatic = [
    `#${ctx?.genre.replace(/\s+/g, "")}Music`,
    `#${ctx?.genre.replace(/\s+/g, "")}Artist`,
    `#IndependentArtist`,
    `#NewMusic`,
    `#UnsignedArtist`,
  ];

  const _broadStatic = [
    "#Music",
    "#MusicProducer",
    "#Artist",
    "#MusicLife",
    "#StreamingNow",
    "#MusicMarketing",
  ];

  const _niche = aiTags?.length >= 5 ? aiTags?.slice(0, 5) : nicheStatic;
  const _broad = aiTags?.length >= 10 ? aiTags?.slice(5, 10) : broadStatic;
  const _trending =
    aiTags?.length >= 15
      ? aiTags?.slice(10, 15)
      : (trendingAnchor[ctx?.platform] ?? []);

  const _combined = [
    ...branded,
    ...niche?.slice(0, 3),
    ...broad?.slice(0, 3),
    ...trending,
    ...(aiTags?.length >= 20 ? aiTags?.slice(15) : []),
  ].slice(0, 30);

  return { niche, broad, trending, branded, combined };
}

// ─── Ad Copy Generator ───────────────────────────────────────────────────────

export async function generateAdCopy(
  ctx: GeneratorContext,
): Promise<AdCopySet> {
  const _prompt = `Write high-converting ad copy for ${ctx?.artistName} on ${ctx?.platform}.
Genre: ${ctx?.genre}. Goal: ${ctx?.campaignGoal}. Audience: ${ctx?.targetAudience}.
${ctx?.trackTitle ? `Track: "${ctx?.trackTitle}".` : ""}
${ctx?.extraContext ?? ""}
Include:
- Headline (≤40 chars)
- Subheadline (≤80 chars)
- Body (≤150 chars)
- CTA button text (≤20 chars)
Then write 2 A/B variants with different angles.`;

  const _raw = await callMaxCore(prompt, ctx);

  if (raw) {
    const _lines = raw?.split("\n").filter((l) => l?.trim().length > 0);
    return {
      headline: lines[0] ?? "",
      subheadline: lines[1] ?? "",
      body: lines[2] ?? "",
      cta: lines[3] ?? "",
      variants: [
        { headline: lines[4] ?? "", body: lines[5] ?? "", cta: "" },
        { headline: lines[6] ?? "", body: lines[7] ?? "", cta: "" },
      ],
    };
  }

  logger?.debug(
    "[ContentGenerators] MaxCore returned empty ad copy response — local fallback",
  );
  return {
    headline: "",
    subheadline: "",
    body: "",
    cta: "",
    variants: [],
  };
}

// ─── Video Script Generator ──────────────────────────────────────────────────

export async function generateVideoScript(
  ctx: GeneratorContext,
  durationSeconds: 15 | 30 | 60 | 180 = 30,
): Promise<VideoScript> {
  const _prompt = `Write a ${durationSeconds}-second video script for ${ctx?.artistName} on ${ctx?.platform}.
Genre: ${ctx?.genre}. Mood: ${ctx?.mood}. Goal: ${ctx?.campaignGoal}.
${ctx?.trackTitle ? `Track: "${ctx?.trackTitle}".` : ""}
${ctx?.extraContext ?? ""}
Format:
HOOK (spoken/visual — first 3s):
BODY (3 bullet points for middle section):
CTA (final 3–5s call to action):
B-ROLL (4 visual suggestions):
MUSIC NOTE (tempo/energy direction):
OVERLAY TEXTS (3 short text overlays for the video):`;

  const _raw = await callMaxCore(prompt, ctx);

  const _defaultBRoll = [
    `Close-up of artist in moody lighting`,
    `Wide shot: artist performing in ${ctx?.mood} atmosphere`,
    `B-roll of studio session — raw and authentic`,
    `Fans reacting to music`,
  ];

  if (raw) {
    const _lines = raw?.split("\n").filter((l) => l?.trim().length > 0);
    return {
      hook: lines[0] ?? "",
      body: lines?.slice(1, 4),
      cta: lines[4] ?? "",
      durationHint: `${durationSeconds}s`,
      bRoll: defaultBRoll,
      musicNote: "",
      overlayTexts: [lines[5] ?? "", lines[6] ?? "", lines[7] ?? ""],
    };
  }

  logger?.debug(
    "[ContentGenerators] MaxCore returned empty video script response — local fallback",
  );
  return {
    hook: "",
    body: [],
    cta: "",
    durationHint: `${durationSeconds}s`,
    bRoll: defaultBRoll,
    musicNote: "",
    overlayTexts: [],
  };
}

// ─── Visual Prompt Generator ─────────────────────────────────────────────────

export async function generateVisualPrompt(
  ctx: GeneratorContext,
): Promise<VisualPrompt> {
  const _palette = ctx?.colorPalette.join(", ");
  return {
    imagePrompt: `A ${ctx?.mood} ${ctx?.genre} music promotional image for ${ctx?.artistName}. 
Color palette: ${palette}. Cinematic quality, high contrast, professional photography aesthetic.
Subject: musician, artistic environment, emotional expression. No text overlay.`,
    thumbnailPrompt: `YouTube/social thumbnail for ${ctx?.artistName} — ${ctx?.trackTitle ?? "new release"}.
Bold typography, ${ctx?.mood} color scheme (${palette}), artist name prominent.
Eye-catching, high contrast, legible at small sizes.`,
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
  // Ask MaxCore for the 5-frame story copy all at once
  const _prompt = `Write a 5-frame Instagram/Facebook Story sequence for ${ctx?.artistName}, a ${ctx?.genre} artist.
Mood: ${ctx?.mood}. Goal: ${ctx?.campaignGoal}.${ctx?.trackTitle ? ` Track: "${ctx?.trackTitle}".` : ""}
${ctx?.extraContext ?? ""}
Frame rules:
Frame 1 (5s) — Hook: ultra-short stop-scroll text, max 8 words
Frame 2 (7s) — Artist intro: name + track or brand moment, max 12 words
Frame 3 (5s) — Emotion/vibe: lyric snippet or mood statement, max 10 words
Frame 4 (8s) — Engagement: poll question or "this or that", max 12 words
Frame 5 (5s) — CTA: clear action with link, max 8 words
Return exactly 5 lines, one per frame.`;

  const _raw = await callMaxCore(prompt, ctx);
  const _aiLines = raw
    ? raw
        .split("\n")
        .map((l) => l?.replace(/^Frame\s*\d+[:\-–]?\s*/i, "").trim())
        .filter(Boolean)
    : [];

  const frames: StoryFrame[] = [
    {
      frameNumber: 1,
      durationSeconds: 5,
      text: aiLines[0] ?? `👀 You need to hear this`,
      visualNote: `Hook frame — bold text on ${ctx?.colorPalette[0] ?? "dark"} background`,
      stickerSuggestion: "music note gif sticker",
    },
    {
      frameNumber: 2,
      durationSeconds: 7,
      text:
        aiLines[1] ?? `${ctx?.artistName} — ${ctx?.trackTitle ?? "New Music"}`,
      visualNote: `Artist photo/branding — ${ctx?.mood} filter applied`,
      stickerSuggestion: "countdown sticker if pre-release",
    },
    {
      frameNumber: 3,
      durationSeconds: 5,
      text:
        aiLines[2] ??
        `${ctx?.mood.charAt(0).toUpperCase() + ctx?.mood.slice(1)} ${ctx?.genre} energy 🎵`,
      visualNote: `Lyric or waveform visual overlay`,
    },
    {
      frameNumber: 4,
      durationSeconds: 8,
      text: aiLines[3] ?? `What do you feel when you listen?`,
      visualNote: `Poll or question interaction frame`,
      pollQuestion: aiLines[3] ?? `Does this song hit? 🔥 vs 💯`,
    },
    {
      frameNumber: 5,
      durationSeconds: 5,
      text: aiLines[4] ?? `Stream now — link in bio 🎶`,
      visualNote: `CTA frame — swipe-up prompt, bright accent color`,
      stickerSuggestion: "link sticker",
    },
  ];

  return {
    frames,
    totalDurationSeconds: frames?.reduce((sum, f) => sum + f?.durationSeconds, 0),
  };
}
