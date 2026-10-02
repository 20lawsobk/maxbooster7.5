/**
 * MaxCore-backed mastering decision service.
 *
 * PCM feature extraction and sample processing remain in the shared DSP module;
 * this server-only boundary sends its measured feature summary to MaxCore for
 * the mastering decision. There is deliberately no local recommendation path,
 * and no offline fallback: MaxCore runs localized and is always available.
 *
 * Reference anchoring: every recommendation request carries ELITE_REFERENCE_PROFILE,
 * the measured production targets of the Suno-spec elite reference master, so
 * MaxCore's EQ/dynamics/stereo decisions are delta-matched against a known
 * elite curve instead of made from the track's own analysis alone.
 */
import {
  type MasteringAnalysis,
  type MasteringChainConfig,
  type MasteringGenre,
  type SuggestedSettings,
} from "../../shared/ml/audio/IntelligentMasteringEngine.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";

const GENRES = new Set<MasteringGenre>([
  "hip-hop", "electronic", "pop", "rock", "jazz", "classical", "r&b", "metal",
]);

/**
 * Elite reference profile — the production targets every master is
 * delta-matched against.
 *
 * Measured 2026-10-02 from the Suno-spec elite reference master
 * (external/maxcore/suno_spec_Fsharp_minor_138bpm_cinematic_trap.flac):
 * - frequencyBalance: whole-track averaged magnitude spectrum, engine 7-band
 *   layout, normalized shares (sum = 1)
 * - stereoWidth: side-energy share (engine native units, 0 = mono)
 * - dynamicRange: p95-p5 windowed-RMS dB (engine native units)
 * - targetLUFS: ITU-R BS.1770 integrated loudness (ffmpeg ebur128). NOTE: the
 *   engine's own calculateLUFS was fixed the same day (its K-weighting filter
 *   was unstable); target-side currentLUFS is only comparable once that fix
 *   is deployed.
 * - truePeakCeilingDbtp: recommended ceiling (elite measured -0.1 dBTP)
 * - lraLu: elite loudness range, the macro-dynamics target
 */
export interface EliteReferenceProfile {
  frequencyBalance: {
    sub: number;
    bass: number;
    lowMid: number;
    mid: number;
    highMid: number;
    presence: number;
    brilliance: number;
  };
  stereoWidth: number;
  dynamicRange: number;
  targetLUFS: number;
  truePeakCeilingDbtp: number;
  lraLu: number;
  measuredFrom: string;
  measuredAt: string;
}

export const ELITE_REFERENCE_PROFILE: EliteReferenceProfile = {
  frequencyBalance: {
    sub: 0.0598,
    bass: 0.1788,
    lowMid: 0.0841,
    mid: 0.1946,
    highMid: 0.0913,
    presence: 0.1038,
    brilliance: 0.2877,
  },
  stereoWidth: 0.7683,
  dynamicRange: 10.32,
  targetLUFS: -8.1,
  truePeakCeilingDbtp: -1.0,
  lraLu: 9.0,
  measuredFrom: "suno_spec_Fsharp_minor_138bpm_cinematic_trap.flac",
  measuredAt: "2026-10-02",
};

type MaxCoreRecommendation = {
  genre?: string;
  config?: MasteringChainConfig;
  confidence?: number;
  reasoning?: string[];
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
};

/** Defense-in-depth bounds for remote recommendations before executing DSP. */
function sanitizeConfig(config: MasteringChainConfig): MasteringChainConfig {
  if (!config || !Array.isArray(config.eq) || !Array.isArray(config.multibandCompressor)) {
    throw new AIUnavailableError("mastering recommendation (invalid MaxCore config)");
  }
  return {
    inputGain: clamp(config.inputGain, -24, 24, 0),
    eq: config.eq.slice(0, 12).map((band) => ({
      frequency: clamp(band?.frequency, 20, 20000, 1000),
      gain: clamp(band?.gain, -12, 12, 0),
      q: clamp(band?.q, .1, 10, 1),
      type: (["lowShelf", "highShelf", "peak", "lowPass", "highPass"].includes(band?.type)
        ? band.type
        : "peak") as MasteringChainConfig["eq"][number]["type"],
    })),
    multibandCompressor: config.multibandCompressor.slice(0, 8).map((band) => ({
      lowFreq: clamp(band?.lowFreq, 0, 20000, 0),
      highFreq: clamp(band?.highFreq, 20, 20000, 20000),
      threshold: clamp(band?.threshold, -60, -1, -18),
      ratio: clamp(band?.ratio, 1, 20, 2),
      attack: clamp(band?.attack, .1, 200, 10),
      release: clamp(band?.release, 5, 1000, 100),
      knee: clamp(band?.knee, 0, 24, 4),
      makeupGain: clamp(band?.makeupGain, -12, 12, 0),
    })),
    stereo: {
      width: clamp(config.stereo?.width, 0, 2, 1),
      bassMonoFreq: clamp(config.stereo?.bassMonoFreq, 20, 300, 120),
      midSideBalance: clamp(config.stereo?.midSideBalance, -1, 1, 0),
      correlation: clamp(config.stereo?.correlation, -1, 1, .3),
    },
    loudness: {
      targetLUFS: clamp(config.loudness?.targetLUFS, -24, -6, -14),
      truePeak: clamp(config.loudness?.truePeak, -3, 0, -1),
      loudnessRange: clamp(config.loudness?.loudnessRange, 1, 24, 8),
      shortTermMax: clamp(config.loudness?.shortTermMax, 0, 12, 3),
    },
    limiter: {
      ceiling: clamp(config.limiter?.ceiling, -3, -.1, -1),
      release: clamp(config.limiter?.release, 5, 1000, 50),
      lookahead: clamp(config.limiter?.lookahead, 0, 20, 1.5),
      softClip: Boolean(config.limiter?.softClip),
    },
    outputGain: clamp(config.outputGain, -24, 24, 0),
    dithering: Boolean(config.dithering),
    bitDepth: [16, 24, 32].includes(config.bitDepth) ? config.bitDepth : 24,
  };
}

/**
 * Pure payload builder for the MaxCore mastering-recommendation call.
 * Exported for unit testing; the network call itself stays in
 * getMaxCoreMasteringRecommendation.
 */
export function buildMasteringRecommendationPayload(
  analysis: MasteringAnalysis,
  sampleRate: number,
  genre?: MasteringGenre,
) {
  // Do not send waveform-length arrays (envelope/onsets/beat positions). Every
  // scalar below was measured from the actual PCM by analyzeForMastering().
  const { envelope: _envelope, transients: _transients, ...dynamics } = analysis.dynamics;
  const { beatPositions: _beats, onsetStrength: _onsets, ...rhythm } = analysis.rhythm;
  return {
    spectral: analysis.spectral,
    dynamics,
    rhythm,
    timbre: analysis.timbre,
    currentLUFS: analysis.currentLUFS,
    currentPeak: analysis.currentPeak,
    dynamicRange: analysis.dynamicRange,
    stereoWidth: analysis.stereoWidth,
    frequencyBalance: analysis.frequencyBalance,
    genre: genre ?? null,
    sampleRate,
    referenceProfile: ELITE_REFERENCE_PROFILE,
  };
}

export async function getMaxCoreMasteringRecommendation(
  analysis: MasteringAnalysis,
  sampleRate: number,
  genre?: MasteringGenre,
): Promise<SuggestedSettings> {
  const result = requireMaxCore(
    await MaxCoreAIClient.infer<MaxCoreRecommendation>(
      "/api/audio/mastering-recommendation",
      buildMasteringRecommendationPayload(analysis, sampleRate, genre),
    ),
    "AI mastering recommendation",
  );
  if (!result.config || !GENRES.has(result.genre as MasteringGenre) ||
      !Array.isArray(result.reasoning) || typeof result.confidence !== "number") {
    throw new AIUnavailableError("mastering recommendation (invalid MaxCore response)");
  }
  return {
    genre: result.genre as MasteringGenre,
    config: sanitizeConfig(result.config),
    confidence: clamp(result.confidence, 0, 1, 0),
    reasoning: result.reasoning.filter((item): item is string => typeof item === "string").slice(0, 8),
  };
}