/**
 * Creative Model Service
 *
 * TypeScript port and integration of the AdvancedCreativeModel pipeline.
 *
 * Original pipeline (Python):
 *   Brief → MusicAnalysis → Planning → Keyframes → TemporalAlignment
 *         → VideoAssembly → EngagementScoring → FeedbackLoop
 *
 * Integration mapping:
 *   MusicAnalysis      → MaxCore AI  /api/audio/analyze
 *   Planning + Script  → MaxCore AI  /api/generate/text  (mode: planner + content)
 *   Keyframes          → MaxCore AI  /api/generate/image  (one per beat)
 *   TemporalAlignment  → Local BPM math + MaxCore refinement
 *   VideoAssembly      → videoGeneratorService (FFmpeg)
 *   EngagementScoring  → MaxCore AI  /api/generate/text  (mode: score)
 *   FeedbackLoop       → autopilotLearningService.recordPerformance
 *
 * All AI calls route exclusively through MaxCore AI (source: 'MaxCoreAI').
 */

import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { autopilotLearningService, type PostData, type AnalyticsData } from './autopilotLearningService.js';

// ─── MaxCore connection (mirrors multimodalGenerationService pattern) ──────────

const _MAXCORE_BASE = (
  process.env.AI_SERVER_URL || 'https://secure-ai-forge.replit.app'
).replace(/\/api\/?$/, '');
const MAXCORE_URL = `${_MAXCORE_BASE}/api`;
const MAXCORE_KEY = process.env.AI_SERVER_KEY || '';

async function maxcorePost(path: string, body: unknown, timeoutMs = 30_000): Promise<any> {
  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(MAXCORE_KEY
        ? { Authorization: `Bearer ${MAXCORE_KEY}`, 'X-API-Key': MAXCORE_KEY }
        : {}),
    },
    body: JSON.stringify({ ...body as object, source: 'MaxCoreAI' }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }

  return res.json();
}

function tryParseJson(raw: string): any {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : raw;
  const s = candidate.indexOf('{');
  const e = candidate.lastIndexOf('}');
  if (s !== -1 && e !== -1) {
    try { return JSON.parse(candidate.slice(s, e + 1)); } catch { /* fall through */ }
  }
  return JSON.parse(raw);
}

// ─── Public Types ─────────────────────────────────────────────────────────────

/**
 * Creative brief — mirrors the Python `Brief` dataclass exactly.
 * All fields are required; callers may pass defaults for optional semantic fields.
 */
export interface CreativeBrief {
  /** "music" | "advertising" | "social_media" | "technology" */
  domain: string;
  /** "tiktok" | "reels" | "shorts" | "feed" | "story" | "youtube" | ... */
  platform: string;
  /** "awareness" | "launch" | "conversion" | "engagement" | "growth" */
  goal: string;
  /** "cinematic" | "high_energy" | "lo_fi" | "hype" | "emotional" | ... */
  tone: string;
  offer: string;
  callToAction: string;
  keyMessages: string[];
  style: {
    aesthetic?: string;
    camera?: string;
    vibe?: string;
    [key: string]: unknown;
  };
}

/** A single beat / scene within the creative plan */
export interface BeatNote {
  timecodeHint: string;
  description: string;
  emotionalGoal: string;
}

/** Full creative plan produced by the planning stage */
export interface CreativePlan {
  beats: BeatNote[];
  visuals: string[];
  hooks: string[];
  testingVariants: string[];
}

/** Music metadata produced by the analysis stage */
export interface MusicMeta {
  audioPat: string;
  bpm: number;
  key: string;
  sections: Array<{ name: string; start: number; end: number }>;
  energyCurve: number[];
  mood: string[];
}

/** Beat-locked timeline produced by the alignment stage */
export interface AlignedTimeline {
  timeline: Array<{ start: number; end: number; beat: BeatNote }>;
  transitions: string[];
}

/** Predicted engagement scores produced by the scoring stage */
export interface EngagementScores {
  watchTimeScore: number;
  hookStrength: number;
  conversionScore: number;
}

/** Full output package returned by `creativeModelService.generate` */
export interface CreativePackage {
  id: string;
  brief: CreativeBrief;
  musicMeta: MusicMeta;
  plan: CreativePlan;
  script: string;
  keyframePaths: string[];
  timing: AlignedTimeline;
  videoPath: string;
  scores: EngagementScores;
  generatedAt: string;
}

// ─── Stage 1: Music Analysis ──────────────────────────────────────────────────

async function analyzeMusicStage(audioPath: string, brief: CreativeBrief): Promise<MusicMeta> {
  logger.info('[CreativeModel] Stage 1: Music analysis', { audioPath });

  try {
    const raw = await maxcorePost('/audio/analyze', {
      audio_path: audioPath,
      context: {
        domain: brief.domain,
        tone: brief.tone,
        platform: brief.platform,
      },
    });

    return {
      audioPat: audioPath,
      bpm: raw.bpm ?? raw.tempo ?? 120,
      key: raw.key ?? raw.musical_key ?? 'C major',
      sections: Array.isArray(raw.sections)
        ? raw.sections.map((s: any) => ({
            name: s.name ?? s.label ?? 'section',
            start: Number(s.start ?? 0),
            end: Number(s.end ?? s.start + 8),
          }))
        : [
            { name: 'intro', start: 0, end: 8 },
            { name: 'verse', start: 8, end: 24 },
            { name: 'chorus', start: 24, end: 40 },
          ],
      energyCurve: Array.isArray(raw.energy_curve) ? raw.energy_curve : [0.4, 0.7, 0.9, 0.6],
      mood: Array.isArray(raw.mood) ? raw.mood : [brief.tone],
    };
  } catch (err) {
    logger.warn('[CreativeModel] Music analysis fallback (MaxCore unavailable)', { err });
    return {
      audioPat: audioPath,
      bpm: 120,
      key: 'C major',
      sections: [
        { name: 'intro', start: 0, end: 8 },
        { name: 'verse', start: 8, end: 24 },
        { name: 'chorus', start: 24, end: 40 },
      ],
      energyCurve: [0.4, 0.7, 0.9, 0.6],
      mood: [brief.tone],
    };
  }
}

// ─── Stage 2: Creative Planning ───────────────────────────────────────────────

async function planningStage(brief: CreativeBrief, musicMeta: MusicMeta): Promise<CreativePlan> {
  logger.info('[CreativeModel] Stage 2: Creative planning');

  const prompt = `
You are a world-class music marketing creative director.
Given the following brief and music metadata, produce a detailed creative plan for a short-form video ad.

BRIEF:
- Domain: ${brief.domain}
- Platform: ${brief.platform.toUpperCase()}
- Goal: ${brief.goal}
- Tone: ${brief.tone}
- Offer: ${brief.offer}
- CTA: ${brief.callToAction}
- Key messages: ${brief.keyMessages.join(' | ')}
- Visual style: ${JSON.stringify(brief.style)}

MUSIC:
- BPM: ${musicMeta.bpm} | Key: ${musicMeta.key}
- Mood: ${musicMeta.mood.join(', ')}
- Sections: ${musicMeta.sections.map(s => `${s.name} (${s.start}s–${s.end}s)`).join(', ')}
- Energy curve: ${musicMeta.energyCurve.join(', ')}

Return JSON only:
{
  "beats": [
    { "timecodeHint": "0-3s", "description": "...", "emotionalGoal": "..." }
  ],
  "visuals": ["...", "..."],
  "hooks": ["...", "..."],
  "testingVariants": ["origin_story", "bold_claim", "fan_reaction"]
}`.trim();

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'content',
      platform: brief.platform,
      topic: `${brief.domain} creative plan — ${brief.goal}`,
      tone: brief.tone,
      prompt,
      format: 'json',
    });

    const text: string =
      raw.text ?? raw.content ?? raw.outputs?.[0]?.text ?? JSON.stringify(raw);
    const parsed = tryParseJson(text);

    return {
      beats: Array.isArray(parsed.beats)
        ? parsed.beats.map((b: any) => ({
            timecodeHint: b.timecodeHint ?? b.timecode_hint ?? '0-3s',
            description: b.description ?? '',
            emotionalGoal: b.emotionalGoal ?? b.emotional_goal ?? 'curiosity',
          }))
        : defaultBeats(brief),
      visuals: Array.isArray(parsed.visuals) ? parsed.visuals : ['studio shots', 'crowd'],
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [brief.offer],
      testingVariants: Array.isArray(parsed.testingVariants ?? parsed.testing_variants)
        ? (parsed.testingVariants ?? parsed.testing_variants)
        : ['origin_story', 'bold_claim', 'fan_reaction'],
    };
  } catch (err) {
    logger.warn('[CreativeModel] Planning fallback', { err });
    return {
      beats: defaultBeats(brief),
      visuals: ['studio shots', 'crowd', 'UI overlays'],
      hooks: [brief.offer, brief.callToAction],
      testingVariants: ['origin_story', 'bold_claim', 'fan_reaction'],
    };
  }
}

function defaultBeats(brief: CreativeBrief): BeatNote[] {
  return [
    { timecodeHint: '0-3s', description: `Hook: ${brief.offer}`, emotionalGoal: 'curiosity' },
    { timecodeHint: '3-10s', description: 'Artist / product in context', emotionalGoal: 'connection' },
    { timecodeHint: '10-15s', description: brief.callToAction, emotionalGoal: 'action' },
  ];
}

// ─── Stage 3: Script Generation ───────────────────────────────────────────────

async function scriptStage(brief: CreativeBrief, plan: CreativePlan): Promise<string> {
  logger.info('[CreativeModel] Stage 3: Script generation');

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'content',
      platform: brief.platform,
      topic: `${brief.platform.toUpperCase()} video script — ${brief.goal}`,
      tone: brief.tone,
      artist_name: brief.domain === 'music' ? brief.offer : undefined,
      brand_voice: brief.tone,
      extra_context: [
        `Hook: ${plan.hooks[0]}`,
        `Beats: ${plan.beats.map(b => `[${b.timecodeHint}] ${b.description}`).join(' | ')}`,
        `CTA: ${brief.callToAction}`,
      ].join('\n'),
    });

    return (
      raw.text ??
      raw.script ??
      raw.caption ??
      raw.outputs?.[0]?.text ??
      `[${brief.platform.toUpperCase()} SCRIPT]\nHook: ${plan.hooks[0]}\nOffer: ${brief.offer}\nCTA: ${brief.callToAction}`
    );
  } catch (err) {
    logger.warn('[CreativeModel] Script fallback', { err });
    return `[${brief.platform.toUpperCase()} SCRIPT]\nHook: ${plan.hooks[0]}\nOffer: ${brief.offer}\nCTA: ${brief.callToAction}`;
  }
}

// ─── Stage 4: Keyframe Generation ─────────────────────────────────────────────

async function keyframesStage(
  plan: CreativePlan,
  brief: CreativeBrief,
): Promise<string[]> {
  logger.info('[CreativeModel] Stage 4: Keyframe generation', { beatCount: plan.beats.length });

  const keyframePaths: string[] = [];

  for (let i = 0; i < plan.beats.length; i++) {
    const beat = plan.beats[i];
    const prompt = [
      `${brief.style.aesthetic ?? brief.tone} style,`,
      beat.description,
      `emotional tone: ${beat.emotionalGoal},`,
      `platform: ${brief.platform},`,
      `visual: ${plan.visuals[i % plan.visuals.length]},`,
      brief.style.vibe ?? '',
    ].filter(Boolean).join(' ');

    try {
      const raw = await maxcorePost('/generate/image', {
        prompt,
        aspect_ratio: brief.platform === 'tiktok' || brief.platform === 'reels' || brief.platform === 'shorts'
          ? '9:16'
          : '16:9',
        style: brief.style,
        beat_index: i,
        timecode: beat.timecodeHint,
      });
      keyframePaths.push(
        raw.url ?? raw.image_url ?? raw.path ?? `keyframe_${i}_placeholder`,
      );
    } catch (err) {
      logger.warn(`[CreativeModel] Keyframe ${i} fallback`, { err });
      keyframePaths.push(`keyframe_${i}_placeholder`);
    }
  }

  return keyframePaths;
}

// ─── Stage 5: Temporal Alignment ──────────────────────────────────────────────

async function alignmentStage(
  plan: CreativePlan,
  musicMeta: MusicMeta,
): Promise<AlignedTimeline> {
  logger.info('[CreativeModel] Stage 5: Temporal alignment');

  const secondsPerBeat = 60 / musicMeta.bpm;

  const timeline = plan.beats.map((beat, i) => {
    const defaultStart = i * secondsPerBeat * 4;
    const defaultEnd = defaultStart + secondsPerBeat * 4;

    const timeHintMatch = beat.timecodeHint.match(/([\d.]+)[s]?\s*[-–]\s*([\d.]+)[s]?/);
    const start = timeHintMatch ? parseFloat(timeHintMatch[1]) : defaultStart;
    const end = timeHintMatch ? parseFloat(timeHintMatch[2]) : defaultEnd;

    return { start, end, beat };
  });

  const transitions = musicMeta.energyCurve.map((energy) =>
    energy > 0.7 ? 'cut_on_beat' : energy > 0.4 ? 'crossfade' : 'dissolve',
  );

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'content',
      format: 'json',
      topic: 'Temporal alignment refinement',
      extra_context: JSON.stringify({ timeline, musicMeta }),
      prompt: `Refine this timeline for music-video sync. Return JSON: { "timeline": [...], "transitions": [...] }`,
    });

    const text: string = raw.text ?? raw.content ?? JSON.stringify(raw);
    const parsed = tryParseJson(text);

    if (Array.isArray(parsed?.timeline)) {
      return {
        timeline: parsed.timeline.map((t: any, i: number) => ({
          start: Number(t.start ?? timeline[i]?.start ?? 0),
          end: Number(t.end ?? timeline[i]?.end ?? 4),
          beat: plan.beats[i] ?? plan.beats[plan.beats.length - 1],
        })),
        transitions: Array.isArray(parsed.transitions) ? parsed.transitions : transitions,
      };
    }
  } catch (err) {
    logger.warn('[CreativeModel] Alignment fallback to local math', { err });
  }

  return { timeline, transitions };
}

// ─── Stage 6: Video Assembly ───────────────────────────────────────────────────

async function assemblyStage(
  keyframePaths: string[],
  timing: AlignedTimeline,
  audioPath: string,
  brief: CreativeBrief,
): Promise<string> {
  logger.info('[CreativeModel] Stage 6: Video assembly');

  try {
    const { videoGeneratorService } = await import('./videoGeneratorService.js');
    if (videoGeneratorService && typeof videoGeneratorService.generateVideo === 'function') {
      const videoPath = await videoGeneratorService.generateVideo({
        keyframes: keyframePaths,
        timeline: timing.timeline,
        transitions: timing.transitions,
        audioPath,
        platform: brief.platform,
        style: brief.style,
      });
      return videoPath;
    }
  } catch (err) {
    logger.warn('[CreativeModel] videoGeneratorService unavailable, using placeholder', { err });
  }

  return `creative_video_${randomUUID()}_placeholder`;
}

// ─── Stage 7: Engagement Scoring ──────────────────────────────────────────────

async function scoringStage(
  script: string,
  plan: CreativePlan,
  musicMeta: MusicMeta,
  brief: CreativeBrief,
): Promise<EngagementScores> {
  logger.info('[CreativeModel] Stage 7: Engagement scoring');

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'content',
      format: 'json',
      topic: 'Engagement prediction scoring',
      platform: brief.platform,
      tone: brief.tone,
      extra_context: JSON.stringify({
        script,
        hooks: plan.hooks,
        beats: plan.beats,
        bpm: musicMeta.bpm,
        mood: musicMeta.mood,
        goal: brief.goal,
      }),
      prompt: `Predict engagement for this short-form video creative. Return JSON only:
{
  "watchTimeScore": 0.0-1.0,
  "hookStrength": 0.0-1.0,
  "conversionScore": 0.0-1.0
}`,
    });

    const text: string = raw.text ?? raw.content ?? JSON.stringify(raw);
    const parsed = tryParseJson(text);

    return {
      watchTimeScore: clamp(parsed.watchTimeScore ?? parsed.watch_time_score ?? 0.7),
      hookStrength: clamp(parsed.hookStrength ?? parsed.hook_strength ?? 0.75),
      conversionScore: clamp(parsed.conversionScore ?? parsed.conversion_score ?? 0.65),
    };
  } catch (err) {
    logger.warn('[CreativeModel] Scoring fallback', { err });
    return { watchTimeScore: 0.7, hookStrength: 0.75, conversionScore: 0.65 };
  }
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

// ─── Stage 8: Feedback Loop ───────────────────────────────────────────────────

async function feedbackStage(
  assetId: string,
  userId: number,
  brief: CreativeBrief,
  scores: EngagementScores,
  realMetrics?: Partial<AnalyticsData>,
): Promise<void> {
  logger.info('[CreativeModel] Stage 8: Feedback loop', { assetId });

  const postData: PostData = {
    platform: brief.platform,
    contentType: 'creative_video',
    postId: assetId,
    postedAt: new Date(),
    metadata: {
      goal: brief.goal,
      tone: brief.tone,
      domain: brief.domain,
      predictedScores: scores,
    },
  };

  const analytics: AnalyticsData = {
    engagementRate: scores.watchTimeScore,
    ...realMetrics,
  };

  try {
    await autopilotLearningService.recordPerformance(userId, postData, analytics);
  } catch (err) {
    logger.warn('[CreativeModel] Feedback loop non-fatal error', { err });
  }
}

// ─── Orchestrator (mirrors Python AdvancedCreativeModel.generate) ─────────────

export interface GenerateOptions {
  brief: CreativeBrief;
  audioPath: string;
  userId: number;
  assetId?: string;
}

export async function generateCreativePackage(opts: GenerateOptions): Promise<CreativePackage> {
  const { brief, audioPath, userId } = opts;
  const assetId = opts.assetId ?? `creative_${randomUUID()}`;

  logger.info('[CreativeModel] Pipeline start', { assetId, platform: brief.platform, goal: brief.goal });

  const [musicMeta] = await Promise.all([analyzeMusicStage(audioPath, brief)]);
  const plan = await planningStage(brief, musicMeta);
  const [script, keyframePaths] = await Promise.all([
    scriptStage(brief, plan),
    keyframesStage(plan, brief),
  ]);
  const timing = await alignmentStage(plan, musicMeta);
  const [videoPath, scores] = await Promise.all([
    assemblyStage(keyframePaths, timing, audioPath, brief),
    scoringStage(script, plan, musicMeta, brief),
  ]);

  await feedbackStage(assetId, userId, brief, scores);

  const pkg: CreativePackage = {
    id: assetId,
    brief,
    musicMeta,
    plan,
    script,
    keyframePaths,
    timing,
    videoPath,
    scores,
    generatedAt: new Date().toISOString(),
  };

  logger.info('[CreativeModel] Pipeline complete', { assetId, scores });
  return pkg;
}

/**
 * Lightweight scoring-only run — skips media generation.
 * Useful for pre-flight checks before committing to full pipeline.
 */
export async function scoreCreative(
  brief: CreativeBrief,
  plan: CreativePlan,
  script: string,
): Promise<EngagementScores> {
  const musicMeta: MusicMeta = {
    audioPat: '',
    bpm: 120,
    key: 'C major',
    sections: [],
    energyCurve: [],
    mood: [brief.tone],
  };
  return scoringStage(script, plan, musicMeta, brief);
}

/**
 * Planning-only run — returns plan + script without any media generation.
 * Useful for rapid creative ideation in the Studio or social scheduler.
 */
export async function planCreative(
  brief: CreativeBrief,
  audioPath: string,
): Promise<{ musicMeta: MusicMeta; plan: CreativePlan; script: string }> {
  const musicMeta = await analyzeMusicStage(audioPath, brief);
  const plan = await planningStage(brief, musicMeta);
  const script = await scriptStage(brief, plan);
  return { musicMeta, plan, script };
}

/**
 * Ingest real performance metrics back into the learning system.
 * Call this after a post goes live and analytics are available.
 */
export async function submitFeedback(
  assetId: string,
  userId: number,
  brief: CreativeBrief,
  scores: EngagementScores,
  realMetrics: Partial<AnalyticsData>,
): Promise<void> {
  return feedbackStage(assetId, userId, brief, scores, realMetrics);
}
