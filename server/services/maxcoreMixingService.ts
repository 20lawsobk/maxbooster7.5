/**
 * MaxCore-backed per-track mixing decision service.
 *
 * Mirrors maxcoreMasteringService.ts's boundary: PCM feature extraction stays
 * in the shared DSP module; this server-only file sends the measured feature
 * summary for ONE track (plus its inferred instrumental role) to MaxCore for
 * the corrective EQ/compression decision. There is deliberately no local
 * recommendation path -- if MaxCore is unavailable this throws rather than
 * falling back to a name-string heuristic.
 */
import {
  type MasteringAnalysis,
  type MasteringGenre,
} from "../../shared/ml/audio/IntelligentMasteringEngine.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";

export type TrackMixRole = "bass" | "kick" | "drums" | "vocal" | "generic";

export interface TrackMixConfig {
  highpassFreq: number;
  eq: Array<{ frequency: number; gain: number; q: number }>;
  compressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    makeupGain: number;
  };
}

export interface TrackMixRecommendation {
  role: TrackMixRole;
  config: TrackMixConfig;
  confidence: number;
  reasoning: string[];
}

type MaxCoreMixResponse = {
  role?: string;
  config?: TrackMixConfig;
  confidence?: number;
  reasoning?: string[];
};

const ROLES = new Set<TrackMixRole>(["bass", "kick", "drums", "vocal", "generic"]);

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
};

/** Defense-in-depth bounds for remote recommendations before building an ffmpeg filter. */
function sanitizeMixConfig(config: TrackMixConfig): TrackMixConfig {
  if (!config || !Array.isArray(config.eq) || !config.compressor) {
    throw new AIUnavailableError("mixing recommendation (invalid MaxCore config)");
  }
  return {
    highpassFreq: clamp(config.highpassFreq, 20, 500, 40),
    eq: config.eq.slice(0, 8).map((band) => ({
      frequency: clamp(band?.frequency, 20, 20000, 1000),
      gain: clamp(band?.gain, -12, 12, 0),
      q: clamp(band?.q, 0.1, 10, 1),
    })),
    compressor: {
      threshold: clamp(config.compressor?.threshold, -60, -1, -18),
      ratio: clamp(config.compressor?.ratio, 1, 20, 2),
      attack: clamp(config.compressor?.attack, 0.1, 200, 10),
      release: clamp(config.compressor?.release, 5, 1000, 100),
      makeupGain: clamp(config.compressor?.makeupGain, 0, 12, 0),
    },
  };
}

/**
 * Ask MaxCore how to correct ONE track before mixdown, from features measured
 * on that track's own audio (analysis) plus its inferred role in the mix.
 * Two tracks sharing a role get different results if their measured content
 * differs -- this is not a per-role fixed preset lookup.
 */
export async function getMaxCoreMixingRecommendation(
  analysis: MasteringAnalysis,
  role: TrackMixRole,
  genre: MasteringGenre | string | undefined,
  sampleRate: number,
): Promise<TrackMixRecommendation> {
  // Same PCM-only contract as mastering: no waveform-length arrays cross the
  // wire, only scalars measured from the actual track by analyzeForMastering().
  const { envelope: _envelope, transients: _transients, ...dynamics } = analysis.dynamics;
  const { beatPositions: _beats, onsetStrength: _onsets, ...rhythm } = analysis.rhythm;
  const result = requireMaxCore(
    await MaxCoreAIClient.infer<MaxCoreMixResponse>("/api/audio/mixing-recommendation", {
      role,
      spectral: analysis.spectral,
      dynamics,
      rhythm,
      timbre: analysis.timbre,
      currentPeak: analysis.currentPeak,
      dynamicRange: analysis.dynamicRange,
      frequencyBalance: analysis.frequencyBalance,
      genre: genre ?? null,
      sampleRate,
    }),
    "AI mixing recommendation",
  );
  if (
    !result.config ||
    !ROLES.has(result.role as TrackMixRole) ||
    !Array.isArray(result.reasoning) ||
    typeof result.confidence !== "number"
  ) {
    throw new AIUnavailableError("mixing recommendation (invalid MaxCore response)");
  }
  return {
    role: result.role as TrackMixRole,
    config: sanitizeMixConfig(result.config),
    confidence: clamp(result.confidence, 0, 1, 0),
    reasoning: result.reasoning
      .filter((item): item is string => typeof item === "string")
      .slice(0, 8),
  };
}
