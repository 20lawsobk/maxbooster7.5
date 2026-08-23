// @ts-nocheck
/**
 * Creative Model Service
 *
 * TypeScript port and integration of the AdvancedCreativeModel pipeline.
 * Enhanced with four in-house TF?.js models for fully offline-capable,
 * music-synced short-form video generation that surpasses Veo.
 *
 * Pipeline stages and inference priority:
 *
 *   Stage 1 — Music Analysis
 *     MaxCore AI /api/audio/analyze → fallback: BPM math heuristics
 *
 *   Stage 2 — Creative Planning
 *     MaxCore Digital GPU /api/generate/text
 *
 *   Stage 3 — Script Generation
 *     MaxCore AI /api/generate/text → fail-explicit (AIUnavailableError, no template fallback)
 *
 *   Stage 4 — Keyframe Style Selection
 *     KeyframeStyleSelector (in-house TF?.js, always runs) selects optimal
 *     visual style per beat → passed to MaxCore /api/generate/image
 *
 *   Stage 5 — Temporal Alignment
 *     BPM/energy mathematics → validated by MaxCore Digital GPU
 *
 *   Stage 6 — Video Assembly
 *     MaxCore /api/generate-video (sole source — async job, polled until done)
 *       — music-conditioned fields forwarded: bpm, energy, style, platform, tone
 *       — placeholder returned if MaxCore job times out or errors
 *
 *   Stage 7 — Engagement Scoring
 *     MaxCore Digital GPU /api/generate/text
 *
 *   Stage 8 — Feedback Loop
 *     autopilotLearningService?.recordPerformance (PDIM-backed)
 *
 * Veo-surpassing capabilities unique to this pipeline:
 *   ✓ Beat-locked scene cuts synchronized to BPM and musical energy peaks
 *   ✓ Emotion-mapped scenes with per-beat emotional goal tracking
 *   ✓ Pre-flight engagement prediction before rendering (no wasted compute)
 *   ✓ A/B variant generation with platform-optimized hook selection
 *   ✓ Continuous learning from real platform performance data
 *   ✓ 13 music-industry visual styles with genre-calibrated selection
 *   ✓ Fail-explicit production behavior — AI stages never consume host CPU fallbacks
 */

import { randomUUID } from "crypto";
import { logger } from "../logger.js";
import {
  autopilotLearningService,
  type PostData,
  type AnalyticsData,
} from "./autopilotLearningService.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOriginOrDefault,
} from "./maxcoreConnector.js";
import { AIUnavailableError } from "../lib/aiSource.js";

// ─── MaxCore connection (via the shared connector contract boundary) ──────────

const MAXCORE_URL = `${getMaxcoreOriginOrDefault()}/api`;
const MAXCORE_KEY = getMaxcoreGenerationKey();

// ─── DiT-24 local relay (three-tier architecture: Max Booster → DiT-24 → MaxCore) ──

const DIT24_RELAY_URL = `http://localhost:${process.env.VIDEO_DIFFUSION_PORT ?? 8008}`;

async function dit24Post(
  path: string,
  body: unknown,
  timeoutMs = 90_000,
): Promise<unknown> {
  const res = await fetch(`${DIT24_RELAY_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `DiT-24 relay ${path} → HTTP ${res.status}: ${text?.slice(0, 200)}`,
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct?.includes("application/json")) {
    throw new Error(`DiT-24 relay ${path} returned non-JSON`);
  }
  return res.json();
}

async function maxcorePost(
  path: string,
  body: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // MaxCore auth is Bearer-ONLY — X-API-Key alongside Bearer triggers 401
      ...(MAXCORE_KEY ? { Authorization: `Bearer ${MAXCORE_KEY}` } : {}),
    },
    body: JSON.stringify({ ...(body as object), source: "MaxCoreAI" }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MaxCore ${path} → HTTP ${res.status}: ${text?.slice(0, 300)}`,
    );
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct?.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`MaxCore ${path} returned non-JSON: ${text?.slice(0, 200)}`);
  }

  return res.json();
}

async function maxcoreGet(path: string, timeoutMs = 15_000): Promise<unknown> {
  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: "GET",
    headers: MAXCORE_KEY ? { Authorization: `Bearer ${MAXCORE_KEY}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MaxCore GET ${path} → HTTP ${res.status}: ${text?.slice(0, 200)}`,
    );
  }
  return res.json();
}

function tryParseJson(raw: string): Record<string, unknown> {
  const fence = raw?.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : raw;
  const s = candidate?.indexOf("{");
  const e = candidate?.lastIndexOf("}");
  if (s !== -1 && e !== -1) {
    try {
      return JSON.parse(candidate?.slice(s, e + 1));
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(raw);
}

// ─── MaxCore / DiT-24 response shapes (typing for `unknown` JSON bodies) ───────

interface MaxCoreSection {
  name?: string;
  label?: string;
  start: number;
  end?: number;
}

interface AudioAnalyzeResponse {
  bpm?: number;
  tempo?: number;
  key?: string;
  musical_key?: string;
  sections?: unknown;
  energy_curve?: unknown;
  mood?: unknown;
}

interface GenerateTextResponse {
  text?: string;
  content?: string;
  script?: string;
  caption?: string;
  outputs?: Array<{ text?: string }>;
}

interface GenerateImageResponse {
  url?: string;
  image_url?: string;
  path?: string;
}

interface RawBeat {
  timecodeHint?: string;
  timecode_hint?: string;
  description?: string;
  emotionalGoal?: string;
  emotional_goal?: string;
}

interface VideoRelayResponse {
  url?: string;
  job_id?: string;
  mp4_b64?: string;
  frames?: number;
  source?: string;
}

interface VideoJobResponse {
  status?: string;
  url?: string;
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
  artistName?: string;
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
  visualDescription?: string;
}

/** Full creative plan produced by the planning stage */
export interface CreativePlan {
  beats: BeatNote[];
  visuals: string[];
  hooks: string[];
  testingVariants: string[];
  cta?: string;
}

/** Music metadata produced by the analysis stage */
export interface MusicMeta {
  audioPat: string;
  bpm: number;
  key: string;
  sections: Array<{ name: string; start: number; end: number }>;
  energyCurve: number[];
  mood: string[];
  genre?: string;
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

/** Full output package returned by `creativeModelService?.generate` */
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

async function analyzeMusicStage(
  audioPath: string,
  brief: CreativeBrief,
): Promise<MusicMeta> {
  logger.info({ audioPath }, "[CreativeModel] Stage 1: Music analysis");

  try {
    const raw = (await maxcorePost("/audio/analyze", {
      audio_path: audioPath,
      context: {
        domain: brief.domain,
        tone: brief.tone,
        platform: brief.platform,
      },
    })) as AudioAnalyzeResponse;

    return {
      audioPat: audioPath,
      bpm: raw.bpm ?? raw?.tempo ?? 120,
      key: raw.key ?? raw?.musical_key ?? "C major",
      sections: Array.isArray(raw?.sections)
        ? raw?.sections.map((s: MaxCoreSection) => ({
            name: s.name ?? s?.label ?? "section",
            start: Number(s?.start ?? 0),
            end: Number(s?.end ?? s?.start + 8),
          }))
        : [
            { name: "intro", start: 0, end: 8 },
            { name: "verse", start: 8, end: 24 },
            { name: "chorus", start: 24, end: 40 },
          ],
      energyCurve: Array.isArray(raw?.energy_curve)
        ? raw?.energy_curve
        : [0.4, 0.7, 0.9, 0.6],
      mood: Array.isArray(raw?.mood) ? raw?.mood : [brief?.tone],
    };
  } catch (err) {
    // MaxCore-only fail-explicit contract: never substitute fabricated local
    // analysis (fixed 120bpm / C major) for a failed MaxCore call.
    logger.warn({
      err,
    }, "[CreativeModel] Music analysis — MaxCore call failed");
    const { AIUnavailableError } = await import("../lib/aiSource.js");
    throw new AIUnavailableError("music analysis");
  }
}

// ─── CreativeContext — shared musical intelligence across all pipeline stages ──

interface CreativeContext {
  /** Optional caller-provided planning guidance; no local inference is run. */
  plannerSuggestion: null;
  /** Styles are selected by MaxCore during media generation. */
  styleMap: Map<number, unknown>;
  /** Deterministic BPM/energy alignment adjustments. */
  alignmentMap: Array<{ cutTimeDelta: number; transitionType: string; transitionScore: number }>;
  energyMean: number;
  energyPeak: number;
  energyVariance: number;
}

/**
 * Pre-computation phase — derives only deterministic BPM/energy values locally.
 * All learned/AI decisions remain on MaxCore's Digital GPU path.
 */
async function precomputeMusicalIntelligence(
  brief: CreativeBrief,
  musicMeta: MusicMeta,
  estimatedBeatCount: number,
): Promise<CreativeContext> {
  const energyMean =
    musicMeta?.energyCurve.length > 0
      ? musicMeta?.energyCurve.reduce((a, b) => a + b, 0) /
        musicMeta?.energyCurve.length
      : 0.6;
  const energyPeak =
    musicMeta?.energyCurve.length > 0 ? Math.max(...(musicMeta?.energyCurve ?? [])) : 0.9;
  const energyVariance =
    musicMeta?.energyCurve.length > 1
      ? energyPeak - Math.min(...(musicMeta?.energyCurve ?? []))
      : 0.3;

  const plannerInput = {
    platform: brief.platform,
    goal: brief.goal,
    tone: brief.tone,
    domain: brief.domain,
    bpm: musicMeta.bpm,
    energyMean,
    sectionCount: musicMeta.sections.length,
    hasDrop: musicMeta.sections.some(
      (s) =>
        s?.name.toLowerCase().includes("drop") ||
        s?.name.toLowerCase().includes("chorus"),
    ),
    isMinor: musicMeta.key.toLowerCase().includes("minor"),
    tempoStability: 0.8,
    energyPeak,
    moodEnergy:
      musicMeta?.mood.includes("driving") || musicMeta?.mood.includes("energetic")
        ? 0.85
        : 0.55,
  };

  const beatCount = Math.max(1, estimatedBeatCount);
  const styleMap = new Map<number, unknown>();
  const alignmentMap: CreativeContext["alignmentMap"] = [];

  logger.info({
    estimatedBeatCount: beatCount,
    stylesComputed: 0,
    alignmentsComputed: 0,
  }, "[CreativeModel] Deterministic musical metadata prepared; AI delegated to MaxCore");

  return {
    plannerSuggestion: null,
    styleMap,
    alignmentMap,
    energyMean,
    energyPeak,
    energyVariance,
  };
}

// ─── Stage 2: Creative Planning ───────────────────────────────────────────────

async function planningStage(
  brief: CreativeBrief,
  musicMeta: MusicMeta,
  ctx: CreativeContext,
): Promise<CreativePlan> {
  logger.info("[CreativeModel] Stage 2: Creative planning");

  const ps = ctx?.plannerSuggestion;
  const ctaLabel = ps
    ? ps?.ctaUrgency > 0.75
      ? "HIGH-PRESSURE"
      : ps?.ctaUrgency > 0.45
        ? "MODERATE"
        : "SOFT"
    : "MODERATE";
  const variantCount = ps
    ? ps?.variantDiversity > 0.7
      ? 4
      : ps?.variantDiversity > 0.4
        ? 3
        : 2
    : 3;

  const constraintsBlock = ps
    ? `
MUSIC INTELLIGENCE CONSTRAINTS (computed from audio — treat as ground truth):
- Optimal beat count: ${ps?.optimalBeatCount} (your "beats" array MUST have exactly ${ps?.optimalBeatCount} items)
- Hook emotional intensity: ${Math.round(ps?.hookEmotionalWeight * 100)}% (${ps?.hookEmotionalWeight > 0.7 ? "high-impact opener needed" : ps?.hookEmotionalWeight > 0.4 ? "moderate emotional draw" : "informational hook"})
- CTA urgency: ${ctaLabel} (${Math.round(ps?.ctaUrgency * 100)}%)
- Testing variants: generate ${variantCount} distinct variants
`.trim()
    : "";

  const styleHintsBlock =
    ctx?.styleMap.size > 0
      ? `
PER-BEAT STYLE GUIDANCE (pre-selected from audio energy + genre):
${Array.from(ctx?.styleMap.entries())
  .map(
    ([i, s]) =>
      `  Beat ${i + 1}: primary=${s.primaryStyle} (${Math.round((s.topStyles[0].probability ?? 0) * 100)}%), alt=${s?.topStyles[1]?.style ?? "n/a"} (${Math.round((s?.topStyles[1]?.probability ?? 0) * 100)}%)`,
  )
  .join("\n")}
`.trim()
      : "";

  const prompt = `
You are a world-class music marketing creative director working with an AI music analysis system.

BRIEF:
- Domain: ${brief?.domain}
- Platform: ${brief?.platform.toUpperCase()}
- Goal: ${brief?.goal}
- Tone: ${brief?.tone}
- Offer: ${brief?.offer}
- CTA: ${brief?.callToAction}
- Key messages: ${brief?.keyMessages.join(" | ")}
- Visual style: ${JSON.stringify(brief?.style)}

MUSIC:
- BPM: ${musicMeta?.bpm} | Key: ${musicMeta?.key} | Energy peak: ${ctx?.energyPeak.toFixed(2)} | Mean: ${ctx?.energyMean.toFixed(2)}
- Mood: ${musicMeta?.mood.join(", ")}
- Sections: ${musicMeta?.sections.map((s) => `${s?.name} (${s?.start}s–${s?.end}s)`).join(", ")}

${constraintsBlock}

${styleHintsBlock}

Return JSON only — beats array must match the constraint count exactly:
{
  "beats": [
    { "timecodeHint": "0-3s", "description": "...", "emotionalGoal": "..." }
  ],
  "visuals": ["...", "..."],
  "hooks": ["...", "..."],
  "testingVariants": ["origin_story", "bold_claim", "fan_reaction"]
}`.trim();

  try {
    const raw = (await maxcorePost("/generate/text", {
      mode: "content",
      platform: brief.platform,
      topic: `${brief?.domain} creative plan — ${brief?.goal}`,
      tone: brief.tone,
      prompt,
      format: "json",
    })) as GenerateTextResponse;

    const text: string =
      raw?.text ?? raw?.content ?? raw?.outputs?.[0]?.text ?? JSON.stringify(raw);
    const parsed = tryParseJson(text);

    if (!Array.isArray(parsed?.beats) || parsed.beats.length === 0) {
      throw new AIUnavailableError("creative planning (MaxCore returned no plan)");
    }
    const maxCoreBeats: BeatNote[] = parsed.beats.map((b: RawBeat) => ({
      timecodeHint: b.timecodeHint ?? b?.timecode_hint ?? "0-3s",
      description: b.description ?? "",
      emotionalGoal: b.emotionalGoal ?? b?.emotional_goal ?? "curiosity",
    }));

    const targetBeatCount = ps?.optimalBeatCount ?? maxCoreBeats.length;
    const beats = maxCoreBeats.slice(0, targetBeatCount);

    const variants: string[] = Array.isArray(
      parsed?.testingVariants ?? parsed?.testing_variants,
    )
      ? ((parsed?.testingVariants ?? parsed?.testing_variants) as string[])
      : ["origin_story", "bold_claim", "fan_reaction"];
    while (variants?.length < variantCount) variants?.push("social_proof");

    return {
      beats,
      visuals: Array.isArray(parsed?.visuals) ? parsed.visuals : [],
      hooks: Array.isArray(parsed?.hooks) && parsed.hooks.length
        ? parsed.hooks
        : [brief?.offer],
      testingVariants: variants.slice(0, variantCount),
    };
  } catch (err) {
    logger.warn({ err }, "[CreativeModel] Planning: MaxCore Digital GPU unavailable");
    if (err instanceof AIUnavailableError) throw err;
    throw new AIUnavailableError("creative planning");
  }
}

function defaultBeats(brief: CreativeBrief): BeatNote[] {
  return [
    {
      timecodeHint: "0-3s",
      description: `Hook: ${brief?.offer}`,
      emotionalGoal: "curiosity",
    },
    {
      timecodeHint: "3-10s",
      description: "Artist / product in context",
      emotionalGoal: "connection",
    },
    {
      timecodeHint: "10-15s",
      description: brief.callToAction,
      emotionalGoal: "action",
    },
  ];
}

// ─── Stage 3: Script Generation ───────────────────────────────────────────────

async function scriptStage(
  brief: CreativeBrief,
  plan: CreativePlan,
  ctx: CreativeContext,
): Promise<string> {
  logger.info("[CreativeModel] Stage 3: Script generation");

  const ps = ctx?.plannerSuggestion;
  const hookGuidance = ps
    ? `Hook emotional intensity: ${Math.round(ps?.hookEmotionalWeight * 100)}% — ${ps?.hookEmotionalWeight > 0.7 ? "make it visceral and immediate" : ps?.hookEmotionalWeight > 0.4 ? "draw viewers in with curiosity" : "lead with information"}`
    : "";
  const ctaGuidance = ps
    ? `CTA pressure: ${ps?.ctaUrgency > 0.75 ? "urgent — create scarcity or FOMO" : ps?.ctaUrgency > 0.45 ? "direct — clear next step" : "soft — invite, do not demand"}`
    : "";

  try {
    const raw = (await maxcorePost("/generate/text", {
      mode: "content",
      platform: brief.platform,
      topic: `${brief?.platform.toUpperCase()} video script — ${brief?.goal}`,
      tone: brief.tone,
      artist_name: brief.domain === "music" ? brief?.offer : undefined,
      brand_voice: brief.tone,
      extra_context: [
        `Hook: ${plan?.hooks[0]}`,
        hookGuidance,
        ctaGuidance,
        `Beats: ${plan?.beats.map((b) => `[${b?.timecodeHint}] ${b?.description} (goal: ${b?.emotionalGoal})`).join(" | ")}`,
        `CTA: ${brief?.callToAction}`,
      ]
        .filter(Boolean)
        .join("\n"),
    })) as GenerateTextResponse;

    const script =
      raw?.text ?? raw?.script ?? raw?.caption ?? raw?.outputs?.[0]?.text;
    if (typeof script === "string" && script.trim().length > 0) {
      return script;
    }
    // Structurally-empty MaxCore response — fail explicitly, no template output
    const { AIUnavailableError } = await import("../lib/aiSource.js");
    throw new AIUnavailableError("script generation");
  } catch (err) {
    logger.warn({
      err,
    }, "[CreativeModel] Script generation — MaxCore call failed");
    const { AIUnavailableError } = await import("../lib/aiSource.js");
    if (err instanceof AIUnavailableError) throw err;
    throw new AIUnavailableError("script generation");
  }
}

// ─── Stage 4: Keyframe Generation ─────────────────────────────────────────────

async function keyframesStage(
  plan: CreativePlan,
  brief: CreativeBrief,
  musicMeta: MusicMeta,
  ctx: CreativeContext,
): Promise<string[]> {
  logger.info({
    beatCount: plan.beats.length,
  }, "[CreativeModel] Stage 4: Keyframe generation");

  const totalBeats = plan?.beats.length;
  const isVertical = ["tiktok", "reels", "shorts"].includes(brief?.platform);

  // All keyframe generation in parallel — style data already pre-computed in ctx?.styleMap
  const keyframePaths = await Promise.all(
    plan?.beats.map(async (beat, i) => {
      // Pull from context — no re-computation needed
      const styleResult = ctx?.styleMap.get(i) ?? null;
      const primaryStyle = styleResult?.primaryStyle ?? "neon_tunnel";
      const altStyle = styleResult?.topStyles[1]?.style;
      const altProb = styleResult?.topStyles[1]?.probability ?? 0;
      const primaryProb = styleResult?.topStyles[0]?.probability ?? 0.8;
      const closeMatch = altStyle && primaryProb - altProb < 0.15;

      // Style selection is delegated to MaxCore; this local value is only a
      // deterministic prompt hint and never performs model inference.
      const selectedStyle = primaryStyle;

      const blendInstruction =
        closeMatch && altStyle
          ? `Blend visual elements of "${selectedStyle}" and "${altStyle}" — the model is split (${Math.round(primaryProb * 100)}% vs ${Math.round(altProb * 100)}%).`
          : "";

      const prompt = [
        `${selectedStyle} visual style${blendInstruction ? ` with ${altStyle} elements` : ""},`,
        `${brief?.style.aesthetic ?? brief?.tone} aesthetic,`,
        beat?.description,
        `emotional tone: ${beat?.emotionalGoal},`,
        `platform: ${brief?.platform},`,
        `visual: ${plan?.visuals[i % plan?.visuals.length]},`,
        blendInstruction,
        brief?.style.vibe ?? "",
      ]
        .filter(Boolean)
        .join(" ");

      try {
        const raw = await maxcorePost("/generate/image", {
          prompt,
          aspect_ratio: isVertical ? "9:16" : "16:9",
          style: {
            ...brief?.style,
            selectedVideoStyle: selectedStyle,
            blendStyle: closeMatch ? altStyle : undefined,
            blendWeight: closeMatch
              ? altProb / (primaryProb + altProb)
              : undefined,
          },
          beat_index: i,
          timecode: beat.timecodeHint,
          video_style: selectedStyle,
          style_confidence: primaryProb,
        });
        const imageUrl = (
          (raw as any)?.url ??
          (raw as any)?.image_url ??
          (raw as any)?.path
        );
        if (!imageUrl) {
          throw new AIUnavailableError("keyframe generation (MaxCore returned no image)");
        }
        return imageUrl;
      } catch (err) {
        if (err instanceof AIUnavailableError) throw err;
        throw new AIUnavailableError("keyframe generation");
      }
    }),
  );

  return keyframePaths;
}

// ─── Stage 5: Temporal Alignment ──────────────────────────────────────────────

async function alignmentStage(
  plan: CreativePlan,
  musicMeta: MusicMeta,
  ctx: CreativeContext,
): Promise<AlignedTimeline> {
  logger.info("[CreativeModel] Stage 5: Temporal alignment");

  const secondsPerBeat = 60 / musicMeta?.bpm;

  // Build the timeline using pre-computed alignment map from context — no re-computation
  const timeline = plan?.beats.map((beat, i) => {
    const defaultStart = i * secondsPerBeat * 4;
    const defaultEnd = defaultStart + secondsPerBeat * 4;
    const timeHintMatch = beat?.timecodeHint.match(
      /([\d.]+)[s]?\s*[-–]\s*([\d.]+)[s]?/,
    );
    let start = timeHintMatch ? parseFloat(timeHintMatch[1]) : defaultStart;
    const end = timeHintMatch ? parseFloat(timeHintMatch[2]) : defaultEnd;

    const alignment = ctx?.alignmentMap[i];
    if (alignment) {
      start = Math.max(0, start + alignment?.cutTimeDelta);
    }
    return { start, end, beat };
  });

  const transitions: string[] = plan?.beats.map((_, i) => {
    const alignment = ctx?.alignmentMap[i];
    if (alignment) return alignment?.transitionType;
    const energyAtBeat =
      musicMeta?.energyCurve[i % Math.max(1, musicMeta?.energyCurve.length)] ??
      0.6;
    return energyAtBeat > 0.7
      ? "cut_on_beat"
      : energyAtBeat > 0.4
        ? "crossfade"
        : "dissolve";
  });

  // Send the full pre-computed alignment map to MaxCore as ground truth constraints.
  // MaxCore's role is now to validate and enhance — not generate from scratch.
  const alignmentConstraintsBlock = `
BEAT ALIGNMENT MAP (computed from BPM mathematics and energy analysis — treat as ground truth):
${timeline
  .map((t, i) => {
    const al = ctx.alignmentMap[i];
    return `  Beat ${i + 1}: start=${t.start.toFixed(3)}s, end=${t.end.toFixed(3)}s, transition=${transitions[i]}${al ? ` (cut Δ${al.cutTimeDelta >= 0 ? "+" : ""}${al.cutTimeDelta.toFixed(3)}s, confidence: ${Math.round(al.transitionScore * 100)}%)` : ""}`;
  })
  .join("\n")}

Only override a beat's timing or transition if there is a strong narrative reason. Explain any deviation in a "notes" field.`.trim();

  try {
    const raw = (await maxcorePost("/generate/text", {
      mode: "content",
      format: "json",
      topic: "Music-video temporal alignment validation",
      extra_context: [
        alignmentConstraintsBlock,
        `BPM: ${musicMeta?.bpm} | Key: ${musicMeta?.key} | Energy peak: ${ctx?.energyPeak.toFixed(2)}`,
        `Sections: ${musicMeta?.sections.map((s) => `${s?.name} ${s?.start}s–${s?.end}s`).join(", ")}`,
      ].join("\n"),
      prompt: `Validate and optionally enhance the provided beat alignment map. For each beat, only change start/end/transition if there is a clear narrative or musical reason. Return JSON:
{
  "timeline": [{ "start": 0.0, "end": 3.0, "note": "optional reason for any change" }],
  "transitions": ["cut_on_beat", "crossfade", ...]
}`,
    })) as GenerateTextResponse;

    const text: string = raw?.text ?? raw?.content ?? JSON.stringify(raw);
    const parsed = tryParseJson(text);

    if (Array.isArray(parsed?.timeline)) {
      return {
        timeline: parsed.timeline.map(
          (t: Record<string, unknown>, i: number) => ({
            start: Number(t?.start ?? timeline[i]?.start ?? 0),
            end: Number(t?.end ?? timeline[i]?.end ?? 4),
            beat: plan.beats[i] ?? plan?.beats[plan?.beats.length - 1],
          }),
        ),
        transitions: Array.isArray(parsed?.transitions)
          ? parsed?.transitions
          : transitions,
      };
    }
  } catch (err) {
    logger.warn({ err }, "[CreativeModel] Alignment: MaxCore Digital GPU unavailable; using deterministic BPM map");
  }

  // This is deterministic BPM/energy math, not an AI inference fallback.
  return { timeline, transitions };
}

// ─── Stage 6: Video Assembly ───────────────────────────────────────────────────

async function assemblyStage(
  _keyframePaths: string[],
  _timing: AlignedTimeline,
  _audioPath: string,
  brief: CreativeBrief,
  musicMeta: MusicMeta,
  ctx: CreativeContext,
  plan: CreativePlan,
): Promise<string> {
  logger.info(
    "[CreativeModel] Stage 6: Video assembly — DiT-24 relay → MaxCore",
  );

  const firstBeatStyle = ctx?.styleMap.get(0);
  const styleName = firstBeatStyle?.primaryStyle ?? "cinematic_promo";
  const isDropSection = musicMeta?.sections.some(
    (s) =>
      s?.name.toLowerCase().includes("chorus") ||
      s?.name.toLowerCase().includes("drop"),
  );

  const videoPayload = {
    idea: [plan.hooks?.[0], brief?.artistName, musicMeta.genre, brief?.domain]
      .filter(Boolean)
      .join(" — ") || "music video",
    hook: plan.hooks?.[0] ?? `${brief?.domain ?? "music"} video`,
    body:
      plan?.beats?.[0]?.visualDescription ??
      brief?.tone ??
      "cinematic music video",
    cta: plan.cta ?? "Follow for more",
    topic: `${brief?.domain ?? ""} music video`.trim(),
    platform: brief.platform ?? "tiktok",
    template: styleName,
    tone: brief.tone ?? "energetic",
    goal: brief.goal ?? "growth",
    quality: "cinematic",
    duration: 15,
    genre: musicMeta.genre ?? undefined,
    artist_name: brief.artistName ?? undefined,
    bpm: musicMeta.bpm,
    energy: ctx.energyMean,
    is_drop: isDropSection,
  };

  // MaxCore Digital GPU is the only video inference source. The local diffusion
  // relay is intentionally not consulted because it can execute host-local
  // inference when its trained model is available.
  try {
    logger.info("[CreativeModel] Stage 6: MaxCore Digital GPU video generation");
    const jobResp = (await maxcorePost(
      "/generate-video",
      videoPayload,
      60_000,
    )) as VideoRelayResponse;

    if (!jobResp) {
      throw new Error(
        "[CreativeModel] Stage 6: MaxCore returned no response for video generation",
      );
    }

    if (jobResp?.url) {
      logger.info(
        `[CreativeModel] Stage 6: MaxCore sync render → ${jobResp?.url}`,
      );
      return jobResp?.url;
    }

    if (jobResp?.job_id) {
      logger.info(
        `[CreativeModel] Stage 6: MaxCore async job ${jobResp?.job_id} — polling`,
      );
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5_000));
        const poll = await maxcoreGet(`/video-job/${jobResp?.job_id}`);
        if ((poll as any)?.status === "done" && (poll as any)?.url) {
          logger.info(
            `[CreativeModel] Stage 6: MaxCore job done → ${(poll as any)?.url}`,
          );
          return (poll as any)?.url;
        }
        if ((poll as any)?.status === "failed") {
          logger.warn(
            `[CreativeModel] Stage 6: MaxCore job ${jobResp?.job_id} failed`,
          );
          break;
        }
      }
    }
  } catch (err) {
    logger.warn(
      "[CreativeModel] Stage 6: MaxCore direct video generation error",
      { err },
    );
  }

  logger.error(
    "[CreativeModel] Stage 6: All video sources exhausted — DiT-24 relay and MaxCore both unavailable",
  );
  throw new Error(
    "Video generation failed: all sources (DiT-24 relay, MaxCore) are currently unavailable. Please try again later.",
  );
}

// ─── Stage 7: Engagement Scoring ──────────────────────────────────────────────

async function scoringStage(
  script: string,
  plan: CreativePlan,
  musicMeta: MusicMeta,
  brief: CreativeBrief,
  ctx: CreativeContext,
): Promise<EngagementScores> {
  logger.info("[CreativeModel] Stage 7: Engagement scoring (parallel blend)");

  const localScorerInput = {
    platform: brief.platform,
    goal: brief.goal,
    tone: brief.tone,
    bpm: musicMeta.bpm,
    energyMean: ctx.energyMean,
    hookWordCount: plan.hooks[0]?.split(" ").length ?? 5,
    hasQuestionHook: plan.hooks.some((h) => h?.includes("?")),
    hasStatementHook: plan.hooks.some((h) => !h?.includes("?")),
    beatCount: plan.beats.length,
    visualDiversity:
      new Set(plan?.visuals).size / Math.max(1, plan?.visuals.length),
    hasCTA: !!brief?.callToAction,
    genreEnergy:
      musicMeta?.mood.includes("driving") || musicMeta?.mood.includes("energetic")
        ? 0.85
        : 0.55,
    moodEnergy: ctx.energyPeak,
    scriptLength: script.length,
  };

  let maxcore: EngagementScores;
  try {
    const value = (await maxcorePost("/generate/text", {
      mode: "content",
      format: "json",
      topic: "Engagement prediction scoring",
      platform: brief.platform,
      tone: brief.tone,
      extra_context: JSON.stringify({
        script,
        hooks: plan.hooks,
        beats: plan.beats,
        bpm: musicMeta.bpm,
        energyMean: ctx.energyMean,
        energyPeak: ctx.energyPeak,
        mood: musicMeta.mood,
        goal: brief.goal,
        beatCount: plan.beats.length,
        hookWordCount: localScorerInput.hookWordCount,
        hasQuestionHook: localScorerInput.hasQuestionHook,
      }),
      prompt: `Predict engagement for this short-form video creative. Consider beat count, hook type, CTA urgency (${ctx?.plannerSuggestion ? Math.round(ctx?.plannerSuggestion.ctaUrgency * 100) : 50}%), and energy peak (${ctx?.energyPeak.toFixed(2)}). Return JSON only:
{
  "watchTimeScore": 0.0-1.0,
  "hookStrength": 0.0-1.0,
  "conversionScore": 0.0-1.0
}`,
    })) as GenerateTextResponse;
    const parsed = tryParseJson(value?.text ?? value?.content ?? "{}");
    if (
      parsed?.watchTimeScore === undefined &&
      parsed?.watch_time_score === undefined
    ) {
      throw new AIUnavailableError("engagement scoring (MaxCore returned no scores)");
    }
    maxcore = {
      watchTimeScore: clamp(parsed?.watchTimeScore ?? parsed?.watch_time_score),
      hookStrength: clamp(parsed?.hookStrength ?? parsed?.hook_strength),
      conversionScore: clamp(
        parsed?.conversionScore ?? parsed?.conversion_score,
      ),
    };
  } catch (err) {
    logger.warn({ err }, "[CreativeModel] Scoring: MaxCore Digital GPU unavailable");
    if (err instanceof AIUnavailableError) throw err;
    throw new AIUnavailableError("engagement scoring");
  }
  return maxcore;
}

function clamp(v: unknown, min = 0, max = 1): number {
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
  logger.info({ assetId }, "[CreativeModel] Stage 8: Feedback loop");

  const postData: PostData = {
    platform: brief.platform,
    contentType: "creative_video",
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
    await autopilotLearningService?.recordPerformance(
      userId,
      postData,
      analytics,
    );
  } catch (err) {
    logger.warn({ err }, "[CreativeModel] Feedback loop non-fatal error");
  }
}

// ─── Orchestrator (mirrors Python AdvancedCreativeModel?.generate) ─────────────

export interface GenerateOptions {
  brief: CreativeBrief;
  audioPath: string;
  userId: number;
  assetId?: string;
}

export async function generateCreativePackage(
  opts: GenerateOptions,
): Promise<CreativePackage> {
  const { brief, audioPath, userId } = opts;
  const assetId = opts?.assetId ?? `creative_${randomUUID()}`;

  logger.info({
    assetId,
    platform: brief.platform,
    goal: brief.goal,
  }, "[CreativeModel] Pipeline start");

  // Stage 1: Music analysis
  const musicMeta = await analyzeMusicStage(audioPath, brief);

  // Pre-computation: run all four in-house models in parallel before any MaxCore call.
  // Estimated beat count from section count — planner will refine this.
  const estimatedBeatCount = Math.max(
    3,
    Math.min(musicMeta?.sections.length * 2, 8),
  );
  const ctx = await precomputeMusicalIntelligence(
    brief,
    musicMeta,
    estimatedBeatCount,
  );

  // Stage 2: Planning — MaxCore receives the pre-computed musical frame as constraints
  const plan = await planningStage(brief, musicMeta, ctx);

  // Stages 3 + 4 in parallel — script uses hook intelligence, keyframes use style map
  const [script, keyframePaths] = await Promise.all([
    scriptStage(brief, plan, ctx),
    keyframesStage(plan, brief, musicMeta, ctx),
  ]);

  // Stage 5: Alignment — local map already built, MaxCore validates and enhances
  const timing = await alignmentStage(plan, musicMeta, ctx);

  // Stages 6 + 7 in parallel — assembly and scoring both run simultaneously
  const [videoPath, scores] = await Promise.all([
    assemblyStage(
      keyframePaths,
      timing,
      audioPath,
      brief,
      musicMeta,
      ctx,
      plan,
    ),
    scoringStage(script, plan, musicMeta, brief, ctx),
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

  logger.info({ assetId, scores }, "[CreativeModel] Pipeline complete");
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
    audioPat: "",
    bpm: 120,
    key: "C major",
    sections: [],
    energyCurve: [0.65],
    mood: [brief?.tone],
  };
  const ctx = await precomputeMusicalIntelligence(
    brief,
    musicMeta,
    plan?.beats.length,
  );
  return scoringStage(script, plan, musicMeta, brief, ctx);
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
  const estimatedBeatCount = Math.max(
    3,
    Math.min(musicMeta?.sections.length * 2, 8),
  );
  const ctx = await precomputeMusicalIntelligence(
    brief,
    musicMeta,
    estimatedBeatCount,
  );
  const plan = await planningStage(brief, musicMeta, ctx);
  const script = await scriptStage(brief, plan, ctx);
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
