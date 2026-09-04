/**
 * MaxCore-backed mastering decision service.
 *
 * PCM feature extraction and sample processing remain in the shared DSP module;
 * this server-only boundary sends its measured feature summary to MaxCore for
 * the mastering decision. There is deliberately no local recommendation path.
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

export async function getMaxCoreMasteringRecommendation(
  analysis: MasteringAnalysis,
  sampleRate: number,
  genre?: MasteringGenre,
): Promise<SuggestedSettings> {
  // Do not send waveform-length arrays (envelope/onsets/beat positions). Every
  // scalar below was measured from the actual PCM by analyzeForMastering().
  const { envelope: _envelope, transients: _transients, ...dynamics } = analysis.dynamics;
  const { beatPositions: _beats, onsetStrength: _onsets, ...rhythm } = analysis.rhythm;
  const result = requireMaxCore(
    await MaxCoreAIClient.infer<MaxCoreRecommendation>("/api/audio/mastering-recommendation", {
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
    }),
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