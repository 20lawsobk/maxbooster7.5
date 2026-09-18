/**
 * Thin MaxCore creative-video contract adapter.
 *
 * MaxCore owns analysis, planning, generation, and scoring. This module keeps
 * the existing route response shapes without running local models or rewriting
 * MaxCore output.
 */
import { randomUUID } from "crypto";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { renderVideo } from "./advancedVideoRendererService.js";
import { AIUnavailableError, requireMaxCore } from "../lib/aiSource.js";
import { ensureMaxCoreAudioAsset } from "./maxcoreAssetTransport.js";

export interface CreativeBrief {
  domain: string;
  platform: string;
  goal: string;
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

export interface BeatNote {
  timecodeHint: string;
  description: string;
  emotionalGoal: string;
  visualDescription?: string;
}

export interface CreativePlan {
  beats: BeatNote[];
  visuals: string[];
  hooks: string[];
  testingVariants: string[];
  cta?: string;
}

export interface MusicMeta {
  audioPat: string;
  bpm: number;
  key: string;
  sections: Array<{ name: string; start: number; end: number }>;
  energyCurve: number[];
  mood: string[];
  genre?: string;
}

export interface AlignedTimeline {
  timeline: Array<{ start: number; end: number; beat: BeatNote }>;
  transitions: string[];
}

export interface EngagementScores {
  watchTimeScore: number | null;
  hookStrength: number | null;
  conversionScore: number | null;
}

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

type AudioAnalysis = {
  bpm?: number;
  tempo?: number;
  key?: string;
  musical_key?: string;
  sections?: Array<{ name?: string; label?: string; start?: number; end?: number }>;
  energy_curve?: number[];
  mood?: string[] | string;
  genre?: string;
};

async function analyze(audioPath: string, brief: CreativeBrief, userId: string): Promise<MusicMeta> {
  if (!audioPath) throw new AIUnavailableError("creative audio analysis (audio path required)");
  const raw = requireMaxCore(
    await MaxCoreAIClient.infer<AudioAnalysis>("/audio/analyze", {
      user_id: userId,
      audio_url: audioPath,
      context: {
        domain: brief.domain,
        platform: brief.platform,
        tone: brief.tone,
      },
    }),
    "creative audio analysis",
  );
  const bpm = raw.bpm ?? raw.tempo;
  const key = raw.key ?? raw.musical_key;
  if (!bpm || !key || !Array.isArray(raw.sections) || !Array.isArray(raw.energy_curve)) {
    throw new AIUnavailableError("creative audio analysis (invalid MaxCore response)");
  }
  return {
    audioPat: audioPath,
    bpm,
    key,
    sections: raw.sections.map((section) => ({
      name: section.name ?? section.label ?? "section",
      start: Number(section.start),
      end: Number(section.end),
    })),
    energyCurve: raw.energy_curve,
    mood: Array.isArray(raw.mood) ? raw.mood : raw.mood ? [raw.mood] : [],
    genre: raw.genre,
  };
}

export interface GenerateOptions {
  brief: CreativeBrief;
  audioPath: string;
  userId: string;
  assetId?: string;
}

export async function generateCreativePackage(
  opts: GenerateOptions,
): Promise<CreativePackage> {
  const maxCoreAudioUrl = await ensureMaxCoreAudioAsset(
    opts.audioPath,
    String(opts.userId),
  );
  const musicMeta = await analyze(maxCoreAudioUrl, opts.brief, String(opts.userId));
  const rendered = await renderVideo({
    topic: opts.brief.offer,
    hook: opts.brief.keyMessages[0],
    body: opts.brief.keyMessages.join(" "),
    cta: opts.brief.callToAction,
    platform: opts.brief.platform,
    tone: opts.brief.tone,
    goal: opts.brief.goal,
    genre: musicMeta.genre,
    artist_name: opts.brief.artistName,
    user_audio_path: maxCoreAudioUrl,
    userId: String(opts.userId),
    camera_motion:
      typeof opts.brief.style.camera === "string"
        ? opts.brief.style.camera
        : undefined,
  });
  if (!rendered.success || !rendered.url) {
    throw new AIUnavailableError(
      `creative video generation${rendered.error ? `: ${rendered.error}` : ""}`,
    );
  }
  const script = [rendered.hook, rendered.body, rendered.cta]
    .filter((part): part is string => Boolean(part))
    .join("\n");
  const beats = (rendered.scenes ?? []).map((scene, index) => ({
    timecodeHint: String(index + 1),
    description: scene.text,
    emotionalGoal: scene.type,
  }));
  const creativePlan: CreativePlan = {
    beats,
    visuals: [],
    hooks: rendered.hook ? [rendered.hook] : [],
    testingVariants: [],
    cta: rendered.cta,
  };
  return {
    id: opts.assetId ?? `creative_${randomUUID()}`,
    brief: opts.brief,
    musicMeta,
    plan: creativePlan,
    script,
    keyframePaths: [],
    timing: { timeline: [], transitions: [] },
    videoPath: rendered.url,
    // The whole-video path deliberately does not run a second scoring pass.
    scores: {
      watchTimeScore: null,
      hookStrength: null,
      conversionScore: null,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function planCreative(
  brief: CreativeBrief,
  audioPath: string,
): Promise<{ musicMeta: MusicMeta; plan: CreativePlan; script: string }> {
  void brief;
  void audioPath;
  throw new AIUnavailableError(
    "creative planning (MaxCore has no standalone inferred planner contract)",
  );
}

export async function scoreCreative(
  brief: CreativeBrief,
  creativePlan: CreativePlan,
  script: string,
): Promise<EngagementScores> {
  void brief;
  void creativePlan;
  void script;
  throw new AIUnavailableError(
    "creative scoring (MaxCore has no model-backed engagement scoring contract)",
  );
}

export async function submitFeedback(
  assetId: string,
  userId: string,
  brief: CreativeBrief,
  scores: EngagementScores,
  realMetrics: Record<string, number> = {},
): Promise<void> {
  requireMaxCore(
    await MaxCoreAIClient.infer<Record<string, unknown>>("/train/feedback", {
      asset_id: assetId,
      user_id: userId,
      domain: brief.domain,
      platform: brief.platform,
      predicted_scores: scores,
      metrics: realMetrics,
    }),
    "creative feedback",
  );
}