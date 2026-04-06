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

import { MaxCoreAIClient } from '../unifiedAIController.js';
import { aiService } from '../aiService.js';
import { logger } from '../../logger.js';
import type { SupportedPlatform } from './platformFormatters.js';

// ─── Shared Context ───────────────────────────────────────────────────────────

export interface GeneratorContext {
  artistName: string;
  genre: string;
  mood: string;
  trackTitle?: string;
  releaseDate?: string;
  brandVoice: 'professional' | 'casual' | 'energetic' | 'creative' | 'promotional';
  colorPalette: string[];
  targetAudience: string;
  campaignGoal: 'awareness' | 'engagement' | 'conversion' | 'growth';
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

async function callMaxCore(prompt: string, ctx: GeneratorContext): Promise<string | null> {
  try {
    // /api/generate/content builds caption = hook + "\n\n" + body + "\n\n" + cta
    // server-side, so caption is always clean structured text (never raw model tokens).
    const result = await MaxCoreAIClient.infer<{ caption?: string; hook?: string; body?: string; cta?: string; content?: string; text?: string }>(
      '/api/generate/content',
      {
        topic:          prompt,
        platform:       ctx.platform,
        tone:           ctx.brandVoice,
        genre:          ctx.genre,
        artist_name:    ctx.artistName,
        brand_voice:    ctx.brandVoice,
        target_audience: ctx.targetAudience,
      },
    );
    // Prefer the clean structured caption; fall back to individual fields if absent.
    return result?.caption ?? result?.hook ?? result?.content ?? result?.text ?? null;
  } catch {
    return null;
  }
}

function fallbackText(template: string, ctx: GeneratorContext): string {
  return template
    .replace('{{artist}}', ctx.artistName)
    .replace('{{genre}}', ctx.genre)
    .replace('{{mood}}', ctx.mood)
    .replace('{{track}}', ctx.trackTitle ?? 'this track')
    .replace('{{platform}}', ctx.platform)
    .replace('{{goal}}', ctx.campaignGoal);
}

// ─── Hook Generator ──────────────────────────────────────────────────────────

export async function generateHooks(ctx: GeneratorContext): Promise<HookSet> {
  const prompt = `Generate 5 social media hooks for ${ctx.artistName}, a ${ctx.genre} artist.
Mood: ${ctx.mood}. Platform: ${ctx.platform}. Goal: ${ctx.campaignGoal}.
${ctx.trackTitle ? `Track: "${ctx.trackTitle}".` : ''}
${ctx.extraContext ?? ''}
Return: primary hook, 3 alternates, a question hook, a statement hook, and a cliffhanger hook.
Keep each hook under 15 words. Make the primary hook irresistible in the first 3 seconds.`;

  const raw = await callMaxCore(prompt, ctx);

  if (raw) {
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    return {
      primary: lines[0] ?? fallbackText('{{artist}} just dropped something you need to hear 🔥', ctx),
      alternates: lines.slice(1, 4),
      questionHook: lines[4] ?? `What happens when ${ctx.genre} meets raw emotion?`,
      statementHook: lines[5] ?? `${ctx.artistName} is redefining ${ctx.genre}.`,
      cliffhangerHook: lines[6] ?? `You won't believe what ${ctx.artistName} did next...`,
    };
  }

  // In-house fallback
  const hooks = [
    `${ctx.artistName} just changed the game 🎵`,
    `The ${ctx.genre} sound you've been waiting for`,
    `${ctx.mood} energy × ${ctx.artistName} = this`,
    `Drop everything. Listen to this.`,
  ];
  return {
    primary: hooks[0],
    alternates: hooks.slice(1),
    questionHook: `Ever wonder what real ${ctx.genre} feels like?`,
    statementHook: `${ctx.artistName} is ${ctx.mood} and unapologetic.`,
    cliffhangerHook: `This song almost wasn't released...`,
  };
}

// ─── Caption Generator ───────────────────────────────────────────────────────

export async function generateCaptions(ctx: GeneratorContext): Promise<CaptionSet> {
  const prompt = `Write 3 social media captions for ${ctx.artistName} on ${ctx.platform}.
Genre: ${ctx.genre}. Mood: ${ctx.mood}. Goal: ${ctx.campaignGoal}.
${ctx.trackTitle ? `Track: "${ctx.trackTitle}".` : ''}
${ctx.extraContext ?? ''}
Write:
1. SHORT (≤80 chars) — punchy, emoji-rich
2. MEDIUM (≤200 chars) — story + CTA
3. LONG (≤400 chars) — narrative, emotional, CTA
Use ${ctx.brandVoice} tone. No filler. Every word earns its place.`;

  const raw = await callMaxCore(prompt, ctx);

  if (raw) {
    const sections = raw.split(/\n{2,}/);
    return {
      short: sections[0]?.trim() ?? `${ctx.artistName} 🎵 ${ctx.mood} vibes only. 🔥`,
      medium: sections[1]?.trim() ?? `${ctx.artistName} brings the ${ctx.mood} ${ctx.genre} energy. New music out now — tap in. 🎶`,
      long: sections[2]?.trim() ?? `${ctx.artistName} poured everything into this one. The ${ctx.mood} feeling, the ${ctx.genre} sound, the raw truth — it's all here. Don't sleep on this. Listen now and let us know what you feel. 🎵`,
      platform: ctx.platform,
    };
  }

  return {
    short: `${ctx.artistName} 🔥 ${ctx.mood} ${ctx.genre} — out now.`,
    medium: `${ctx.artistName} is bringing the ${ctx.mood} energy to ${ctx.genre}. New music is here and it hits different. 🎵 Tap the link.`,
    long: `${ctx.artistName} has been working on something special. The ${ctx.mood} atmosphere, the ${ctx.genre} DNA, the honest lyricism — this is the sound you didn't know you needed. Stream it now, share it with someone who needs to feel something real.`,
    platform: ctx.platform,
  };
}

// ─── Hashtag Generator ───────────────────────────────────────────────────────

export async function generateHashtags(ctx: GeneratorContext): Promise<HashtagSet> {
  const branded = [
    `#${ctx.artistName.replace(/\s+/g, '')}`,
    `#MaxBooster`,
  ];

  const niche = [
    `#${ctx.genre.replace(/\s+/g, '')}Music`,
    `#${ctx.genre.replace(/\s+/g, '')}Artist`,
    `#IndependentArtist`,
    `#NewMusic`,
    `#UnsignedArtist`,
  ];

  const broad = [
    '#Music',
    '#MusicProducer',
    '#Artist',
    '#MusicLife',
    '#StreamingNow',
    '#MusicMarketing',
  ];

  const trending: Record<SupportedPlatform, string[]> = {
    tiktok: ['#FYP', '#MusicTikTok', '#NewMusicFriday', '#ViralSounds'],
    instagram: ['#Reels', '#MusicReels', '#ReelItFeelIt', '#InstaMusic'],
    youtube: ['#YouTubeMusic', '#NewRelease', '#MusicVideo'],
    twitter: ['#NowPlaying', '#MusicTwitter'],
    facebook: ['#Music', '#NewRelease'],
    threads: ['#MusicThreads', '#NewMusic'],
    linkedin: ['#MusicIndustry', '#IndieArtist', '#CreativeEconomy'],
    google_business: [],
  };

  const combined = [
    ...branded,
    ...niche.slice(0, 3),
    ...broad.slice(0, 3),
    ...(trending[ctx.platform] ?? []),
  ].slice(0, 30);

  return { niche, broad, trending: trending[ctx.platform] ?? [], branded, combined };
}

// ─── Ad Copy Generator ───────────────────────────────────────────────────────

export async function generateAdCopy(ctx: GeneratorContext): Promise<AdCopySet> {
  const prompt = `Write high-converting ad copy for ${ctx.artistName} on ${ctx.platform}.
Genre: ${ctx.genre}. Goal: ${ctx.campaignGoal}. Audience: ${ctx.targetAudience}.
${ctx.trackTitle ? `Track: "${ctx.trackTitle}".` : ''}
${ctx.extraContext ?? ''}
Include:
- Headline (≤40 chars)
- Subheadline (≤80 chars)
- Body (≤150 chars)
- CTA button text (≤20 chars)
Then write 2 A/B variants with different angles.`;

  const raw = await callMaxCore(prompt, ctx);

  if (raw) {
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    return {
      headline: lines[0] ?? `Hear ${ctx.artistName} Now`,
      subheadline: lines[1] ?? `${ctx.genre} at its finest`,
      body: lines[2] ?? `${ctx.artistName} drops new ${ctx.mood} ${ctx.genre}. Don't miss it.`,
      cta: lines[3] ?? 'Stream Now',
      variants: [
        {
          headline: lines[4] ?? `${ctx.artistName}: New Drop`,
          body: lines[5] ?? `The ${ctx.mood} ${ctx.genre} track you've been waiting for.`,
          cta: 'Listen Free',
        },
        {
          headline: lines[6] ?? `Feel the ${ctx.mood}`,
          body: lines[7] ?? `${ctx.artistName} × ${ctx.genre} × raw emotion.`,
          cta: 'Play It Now',
        },
      ],
    };
  }

  return {
    headline: `Stream ${ctx.artistName} Now`,
    subheadline: `${ctx.mood} ${ctx.genre} that hits different`,
    body: `New music from ${ctx.artistName}. ${ctx.mood} energy meets ${ctx.genre} DNA. Available everywhere.`,
    cta: 'Stream Now',
    variants: [
      {
        headline: `${ctx.artistName} — New Release`,
        body: `The sound you didn't know you needed.`,
        cta: 'Listen Free',
      },
      {
        headline: `Feel Something Real`,
        body: `${ctx.artistName} brings the ${ctx.mood} ${ctx.genre} heat.`,
        cta: 'Play Now',
      },
    ],
  };
}

// ─── Video Script Generator ──────────────────────────────────────────────────

export async function generateVideoScript(
  ctx: GeneratorContext,
  durationSeconds: 15 | 30 | 60 | 180 = 30,
): Promise<VideoScript> {
  const prompt = `Write a ${durationSeconds}-second video script for ${ctx.artistName} on ${ctx.platform}.
Genre: ${ctx.genre}. Mood: ${ctx.mood}. Goal: ${ctx.campaignGoal}.
${ctx.trackTitle ? `Track: "${ctx.trackTitle}".` : ''}
${ctx.extraContext ?? ''}
Format:
HOOK (spoken/visual — first 3s):
BODY (3 bullet points for middle section):
CTA (final 3–5s call to action):
B-ROLL (4 visual suggestions):
MUSIC NOTE (tempo/energy direction):
OVERLAY TEXTS (3 short text overlays for the video):`;

  const raw = await callMaxCore(prompt, ctx);

  const defaultBRoll = [
    `Close-up of artist in moody lighting`,
    `Wide shot: artist performing in ${ctx.mood} atmosphere`,
    `B-roll of studio session — raw and authentic`,
    `Fans reacting to music`,
  ];

  if (raw) {
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    return {
      hook: lines[0] ?? `${ctx.artistName} in the ${ctx.mood} zone`,
      body: lines.slice(1, 4),
      cta: lines[4] ?? `Follow ${ctx.artistName} and stream now`,
      durationHint: `${durationSeconds}s`,
      bRoll: defaultBRoll,
      musicNote: `${ctx.mood} energy, ${ctx.genre} rhythm`,
      overlayTexts: [
        lines[5] ?? ctx.artistName,
        lines[6] ?? ctx.trackTitle ?? 'New Music',
        lines[7] ?? 'Out Now',
      ],
    };
  }

  return {
    hook: `${ctx.artistName} drops the ${ctx.mood} ${ctx.genre} anthem you needed.`,
    body: [
      `Show the creative process — raw studio footage`,
      `Highlight the emotion behind the track`,
      `Connect with the audience — relatable moment`,
    ],
    cta: `Follow ${ctx.artistName} now. New music drops every week.`,
    durationHint: `${durationSeconds}s`,
    bRoll: defaultBRoll,
    musicNote: `Match ${ctx.mood} atmosphere — ${ctx.genre} tempo`,
    overlayTexts: [ctx.artistName, ctx.trackTitle ?? 'New Drop', 'Stream Now 🎵'],
  };
}

// ─── Visual Prompt Generator ─────────────────────────────────────────────────

export async function generateVisualPrompt(ctx: GeneratorContext): Promise<VisualPrompt> {
  const palette = ctx.colorPalette.join(', ');
  return {
    imagePrompt: `A ${ctx.mood} ${ctx.genre} music promotional image for ${ctx.artistName}. 
Color palette: ${palette}. Cinematic quality, high contrast, professional photography aesthetic.
Subject: musician, artistic environment, emotional expression. No text overlay.`,
    thumbnailPrompt: `YouTube/social thumbnail for ${ctx.artistName} — ${ctx.trackTitle ?? 'new release'}.
Bold typography, ${ctx.mood} color scheme (${palette}), artist name prominent.
Eye-catching, high contrast, legible at small sizes.`,
    colorDirections: `Primary: ${ctx.colorPalette[0] ?? '#1a1a2e'} | Accent: ${ctx.colorPalette[2] ?? '#e94560'} | Background: ${ctx.colorPalette[1] ?? '#16213e'}`,
    typographyNote: `Bold, modern sans-serif. Artist name: 48pt+. Track title: 36pt. All caps for impact.`,
    moodBoard: [
      `${ctx.mood} lighting — deep shadows, dramatic contrast`,
      `${ctx.genre} aesthetic — reference iconic artists in the genre`,
      `Authentic, not over-produced`,
      `Color story: ${palette}`,
    ],
  };
}

// ─── Story Sequence Generator ─────────────────────────────────────────────────

export async function generateStorySequence(ctx: GeneratorContext): Promise<StorySequence> {
  const frames: StoryFrame[] = [
    {
      frameNumber: 1,
      durationSeconds: 5,
      text: `👀 You need to hear this`,
      visualNote: `Hook frame — bold text on ${ctx.colorPalette[0] ?? 'dark'} background`,
      stickerSuggestion: 'music note gif sticker',
    },
    {
      frameNumber: 2,
      durationSeconds: 7,
      text: `${ctx.artistName} — ${ctx.trackTitle ?? 'New Music'}`,
      visualNote: `Artist photo/branding — ${ctx.mood} filter applied`,
      stickerSuggestion: 'countdown sticker if pre-release',
    },
    {
      frameNumber: 3,
      durationSeconds: 5,
      text: `${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre} energy 🎵`,
      visualNote: `Lyric or waveform visual overlay`,
    },
    {
      frameNumber: 4,
      durationSeconds: 8,
      text: `What do you feel when you listen?`,
      visualNote: `Poll or question interaction frame`,
      pollQuestion: `Does this song hit? 🔥 vs 💯`,
    },
    {
      frameNumber: 5,
      durationSeconds: 5,
      text: `Stream now — link in bio 🎶`,
      visualNote: `CTA frame — swipe-up prompt, bright accent color`,
      stickerSuggestion: 'link sticker',
    },
  ];

  return {
    frames,
    totalDurationSeconds: frames.reduce((sum, f) => sum + f.durationSeconds, 0),
  };
}
