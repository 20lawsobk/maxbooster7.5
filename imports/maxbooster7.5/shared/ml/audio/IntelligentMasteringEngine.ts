/**
 * Intelligent Mastering Engine - AI-Driven Audio Mastering
 *
 * Professional-grade mastering with:
 * - Genre-aware presets and processing
 * - Dynamic EQ optimization from spectral analysis
 * - Multiband compression with automatic threshold detection
 * - LUFS loudness normalization
 * - Stereo enhancement and width optimization
 * - Reference track matching
 *
 * 100% in-house, no external APIs
 */

import {
  extractSpectralFeatures,
  extractRhythmFeatures,
  extractDynamicFeatures,
  extractTimbreFeatures,
  type SpectralFeatures,
  type RhythmFeatures,
  type DynamicFeatures,
  type TimbreFeatures,
} from "./AudioFeatureExtractor.js";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MasteringGenre =
  | "hip-hop"
  | "electronic"
  | "pop"
  | "rock"
  | "jazz"
  | "classical"
  | "r&b"
  | "metal";

export interface EQBand {
  frequency: number; // Hz
  gain: number; // dB (-12 to +12)
  q: number; // Quality factor (0.1 to 10)
  type: "lowShelf" | "highShelf" | "peak" | "lowPass" | "highPass";
}

export interface MultibandCompressorBand {
  lowFreq: number; // Hz - low crossover
  highFreq: number; // Hz - high crossover
  threshold: number; // dB
  ratio: number; // Compression ratio (1:1 to 20:1)
  attack: number; // ms
  release: number; // ms
  knee: number; // dB
  makeupGain: number; // dB
}

export interface LimiterSettings {
  ceiling: number; // dB (typically -0.1 to -0.3)
  release: number; // ms
  lookahead: number; // ms
  softClip: boolean;
}

export interface StereoSettings {
  width: number; // 0-2 (1 = normal, <1 = narrower, >1 = wider)
  bassMonoFreq: number; // Hz - frequency below which audio is mono
  midSideBalance: number; // -1 to 1 (0 = balanced)
  correlation: number; // Target correlation (-1 to 1)
}

export interface LoudnessSettings {
  targetLUFS: number; // Integrated loudness target (-24 to -6)
  truePeak: number; // dB (typically -1 to 0)
  loudnessRange: number; // LU (dynamic range target)
  shortTermMax: number; // dB above integrated
}

export interface MasteringChainConfig {
  inputGain: number;
  eq: EQBand[];
  multibandCompressor: MultibandCompressorBand[];
  stereo: StereoSettings;
  loudness: LoudnessSettings;
  limiter: LimiterSettings;
  outputGain: number;
  dithering: boolean;
  bitDepth: 16 | 24 | 32;
}

export interface GenrePreset {
  name: MasteringGenre;
  description: string;
  targetLUFS: number;
  truePeak: number;
  eq: EQBand[];
  compression: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  multibandSettings: MultibandCompressorBand[];
  stereoWidth: number;
  limiterCeiling: number;
  characteristics: string[];
}

export interface MasteringAnalysis {
  spectral: SpectralFeatures;
  dynamics: DynamicFeatures;
  rhythm: RhythmFeatures;
  timbre: TimbreFeatures;
  currentLUFS: number;
  currentPeak: number;
  dynamicRange: number;
  stereoWidth: number;
  /** L/R balance in dB (+ = left-heavy). |db| > 0.5 triggers auto-correction. */
  stereoBalanceDb: number;
  frequencyBalance: {
    sub: number; // 20-60 Hz
    bass: number; // 60-250 Hz
    lowMid: number; // 250-500 Hz
    mid: number; // 500-2000 Hz
    highMid: number; // 2000-4000 Hz
    presence: number; // 4000-8000 Hz
    brilliance: number; // 8000-20000 Hz
  };
  issues: MasteringIssue[];
  recommendations: string[];
}

export interface MasteringIssue {
  type: "frequency" | "dynamics" | "stereo" | "loudness" | "phase";
  severity: "low" | "medium" | "high";
  description: string;
  suggestedFix: string;
}

export interface ReferenceMatchResult {
  loudnessAdjustment: number; // dB
  eqCurve: EQBand[];
  stereoAdjustment: number;
  dynamicsAdjustment: {
    threshold: number;
    ratio: number;
  };
  matchConfidence: number; // 0-1
}

export interface SuggestedSettings {
  genre: MasteringGenre | "auto";
  config: MasteringChainConfig;
  confidence: number;
  reasoning: string[];
}

// ============================================================================
// GENRE PRESETS
// ============================================================================

const GENRE_PRESETS: Record<MasteringGenre, GenrePreset> = {
  "hip-hop": {
    name: "hip-hop",
    description: "Heavy bass, punchy drums, clear vocals",
    targetLUFS: -9,
    truePeak: -0.3,
    eq: [
      { frequency: 40, gain: 3, q: 0.8, type: "lowShelf" },
      { frequency: 100, gain: 2, q: 1.0, type: "peak" },
      { frequency: 250, gain: -2, q: 1.5, type: "peak" },
      { frequency: 3000, gain: 2, q: 1.2, type: "peak" },
      { frequency: 10000, gain: 1.5, q: 0.7, type: "highShelf" },
    ],
    compression: { threshold: -12, ratio: 4, attack: 10, release: 100 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 100,
        threshold: -18,
        ratio: 3,
        attack: 20,
        release: 150,
        knee: 6,
        makeupGain: 2,
      },
      {
        lowFreq: 100,
        highFreq: 500,
        threshold: -15,
        ratio: 2.5,
        attack: 15,
        release: 100,
        knee: 4,
        makeupGain: 1,
      },
      {
        lowFreq: 500,
        highFreq: 2000,
        threshold: -14,
        ratio: 2,
        attack: 10,
        release: 80,
        knee: 4,
        makeupGain: 0,
      },
      {
        lowFreq: 2000,
        highFreq: 8000,
        threshold: -16,
        ratio: 2.5,
        attack: 5,
        release: 60,
        knee: 3,
        makeupGain: 1,
      },
      {
        lowFreq: 8000,
        highFreq: 20000,
        threshold: -20,
        ratio: 2,
        attack: 3,
        release: 50,
        knee: 3,
        makeupGain: 0.5,
      },
    ],
    stereoWidth: 1.1,
    limiterCeiling: -0.3,
    characteristics: ["punchy", "bass-heavy", "in-your-face", "modern"],
  },
  electronic: {
    name: "electronic",
    description: "Clean, loud, wide stereo image",
    targetLUFS: -8,
    truePeak: -0.1,
    eq: [
      { frequency: 30, gain: 2, q: 0.7, type: "lowShelf" },
      { frequency: 80, gain: 1.5, q: 1.2, type: "peak" },
      { frequency: 400, gain: -1.5, q: 1.0, type: "peak" },
      { frequency: 5000, gain: 2.5, q: 1.0, type: "peak" },
      { frequency: 12000, gain: 3, q: 0.7, type: "highShelf" },
    ],
    compression: { threshold: -10, ratio: 6, attack: 5, release: 60 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 80,
        threshold: -15,
        ratio: 4,
        attack: 15,
        release: 120,
        knee: 4,
        makeupGain: 2,
      },
      {
        lowFreq: 80,
        highFreq: 400,
        threshold: -14,
        ratio: 3,
        attack: 10,
        release: 80,
        knee: 4,
        makeupGain: 1,
      },
      {
        lowFreq: 400,
        highFreq: 2500,
        threshold: -12,
        ratio: 2.5,
        attack: 5,
        release: 60,
        knee: 3,
        makeupGain: 0,
      },
      {
        lowFreq: 2500,
        highFreq: 8000,
        threshold: -14,
        ratio: 3,
        attack: 3,
        release: 50,
        knee: 3,
        makeupGain: 1.5,
      },
      {
        lowFreq: 8000,
        highFreq: 20000,
        threshold: -18,
        ratio: 2.5,
        attack: 2,
        release: 40,
        knee: 2,
        makeupGain: 1,
      },
    ],
    stereoWidth: 1.3,
    limiterCeiling: -0.1,
    characteristics: ["loud", "wide", "bright", "punchy"],
  },
  pop: {
    name: "pop",
    description: "Balanced, radio-ready, vocal-focused",
    targetLUFS: -10,
    truePeak: -0.5,
    eq: [
      { frequency: 60, gain: 1, q: 0.8, type: "lowShelf" },
      { frequency: 200, gain: -1, q: 1.2, type: "peak" },
      { frequency: 1500, gain: 1, q: 1.0, type: "peak" },
      { frequency: 4000, gain: 2, q: 1.0, type: "peak" },
      { frequency: 10000, gain: 2, q: 0.7, type: "highShelf" },
    ],
    compression: { threshold: -14, ratio: 3, attack: 15, release: 100 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 100,
        threshold: -16,
        ratio: 2.5,
        attack: 20,
        release: 120,
        knee: 5,
        makeupGain: 1,
      },
      {
        lowFreq: 100,
        highFreq: 500,
        threshold: -14,
        ratio: 2,
        attack: 15,
        release: 100,
        knee: 4,
        makeupGain: 0.5,
      },
      {
        lowFreq: 500,
        highFreq: 2000,
        threshold: -12,
        ratio: 2,
        attack: 10,
        release: 80,
        knee: 4,
        makeupGain: 0,
      },
      {
        lowFreq: 2000,
        highFreq: 8000,
        threshold: -14,
        ratio: 2.5,
        attack: 8,
        release: 60,
        knee: 3,
        makeupGain: 1,
      },
      {
        lowFreq: 8000,
        highFreq: 20000,
        threshold: -18,
        ratio: 2,
        attack: 5,
        release: 50,
        knee: 3,
        makeupGain: 0.5,
      },
    ],
    stereoWidth: 1.15,
    limiterCeiling: -0.5,
    characteristics: ["balanced", "radio-ready", "polished", "accessible"],
  },
  rock: {
    name: "rock",
    description: "Aggressive, dynamic, guitar-forward",
    targetLUFS: -11,
    truePeak: -0.5,
    eq: [
      { frequency: 80, gain: 2, q: 0.9, type: "lowShelf" },
      { frequency: 300, gain: -1.5, q: 1.5, type: "peak" },
      { frequency: 800, gain: 1, q: 1.0, type: "peak" },
      { frequency: 3500, gain: 2.5, q: 1.2, type: "peak" },
      { frequency: 8000, gain: 1.5, q: 0.8, type: "highShelf" },
    ],
    compression: { threshold: -16, ratio: 3.5, attack: 20, release: 120 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 120,
        threshold: -18,
        ratio: 2.5,
        attack: 25,
        release: 150,
        knee: 5,
        makeupGain: 1.5,
      },
      {
        lowFreq: 120,
        highFreq: 500,
        threshold: -16,
        ratio: 2,
        attack: 20,
        release: 120,
        knee: 4,
        makeupGain: 0.5,
      },
      {
        lowFreq: 500,
        highFreq: 2000,
        threshold: -14,
        ratio: 2.5,
        attack: 15,
        release: 100,
        knee: 4,
        makeupGain: 0,
      },
      {
        lowFreq: 2000,
        highFreq: 6000,
        threshold: -15,
        ratio: 3,
        attack: 10,
        release: 80,
        knee: 3,
        makeupGain: 1,
      },
      {
        lowFreq: 6000,
        highFreq: 20000,
        threshold: -20,
        ratio: 2,
        attack: 5,
        release: 60,
        knee: 3,
        makeupGain: 0,
      },
    ],
    stereoWidth: 1.2,
    limiterCeiling: -0.5,
    characteristics: ["powerful", "dynamic", "aggressive", "punchy"],
  },
  jazz: {
    name: "jazz",
    description: "Natural, dynamic, warm",
    targetLUFS: -16,
    truePeak: -1.0,
    eq: [
      { frequency: 100, gain: 0.5, q: 0.7, type: "lowShelf" },
      { frequency: 250, gain: -0.5, q: 1.0, type: "peak" },
      { frequency: 2000, gain: 0.5, q: 1.0, type: "peak" },
      { frequency: 6000, gain: 1, q: 0.8, type: "peak" },
      { frequency: 12000, gain: -1, q: 0.7, type: "highShelf" },
    ],
    compression: { threshold: -24, ratio: 1.5, attack: 30, release: 200 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 150,
        threshold: -22,
        ratio: 1.5,
        attack: 30,
        release: 200,
        knee: 8,
        makeupGain: 0.5,
      },
      {
        lowFreq: 150,
        highFreq: 600,
        threshold: -20,
        ratio: 1.5,
        attack: 25,
        release: 180,
        knee: 6,
        makeupGain: 0,
      },
      {
        lowFreq: 600,
        highFreq: 2500,
        threshold: -18,
        ratio: 1.5,
        attack: 20,
        release: 150,
        knee: 6,
        makeupGain: 0,
      },
      {
        lowFreq: 2500,
        highFreq: 8000,
        threshold: -20,
        ratio: 1.5,
        attack: 15,
        release: 120,
        knee: 5,
        makeupGain: 0,
      },
      {
        lowFreq: 8000,
        highFreq: 20000,
        threshold: -24,
        ratio: 1.3,
        attack: 10,
        release: 100,
        knee: 5,
        makeupGain: -0.5,
      },
    ],
    stereoWidth: 1.0,
    limiterCeiling: -1.0,
    characteristics: ["natural", "warm", "dynamic", "organic"],
  },
  classical: {
    name: "classical",
    description: "Maximum dynamics, transparency, natural",
    targetLUFS: -20,
    truePeak: -1.0,
    eq: [
      { frequency: 80, gain: 0, q: 0.7, type: "lowShelf" },
      { frequency: 300, gain: -0.5, q: 1.0, type: "peak" },
      { frequency: 3000, gain: 0.5, q: 0.8, type: "peak" },
      { frequency: 10000, gain: 0.5, q: 0.7, type: "highShelf" },
    ],
    compression: { threshold: -30, ratio: 1.2, attack: 50, release: 300 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 200,
        threshold: -28,
        ratio: 1.2,
        attack: 40,
        release: 250,
        knee: 10,
        makeupGain: 0,
      },
      {
        lowFreq: 200,
        highFreq: 800,
        threshold: -26,
        ratio: 1.2,
        attack: 35,
        release: 220,
        knee: 8,
        makeupGain: 0,
      },
      {
        lowFreq: 800,
        highFreq: 3000,
        threshold: -24,
        ratio: 1.2,
        attack: 30,
        release: 200,
        knee: 8,
        makeupGain: 0,
      },
      {
        lowFreq: 3000,
        highFreq: 10000,
        threshold: -26,
        ratio: 1.2,
        attack: 25,
        release: 180,
        knee: 6,
        makeupGain: 0,
      },
      {
        lowFreq: 10000,
        highFreq: 20000,
        threshold: -28,
        ratio: 1.1,
        attack: 20,
        release: 150,
        knee: 6,
        makeupGain: 0,
      },
    ],
    stereoWidth: 1.0,
    limiterCeiling: -1.0,
    characteristics: ["transparent", "dynamic", "natural", "spacious"],
  },
  "r&b": {
    name: "r&b",
    description: "Warm, smooth, vocal-forward with deep bass",
    targetLUFS: -10,
    truePeak: -0.3,
    eq: [
      { frequency: 50, gain: 2.5, q: 0.8, type: "lowShelf" },
      { frequency: 150, gain: 1, q: 1.0, type: "peak" },
      { frequency: 400, gain: -1.5, q: 1.2, type: "peak" },
      { frequency: 2500, gain: 1.5, q: 1.0, type: "peak" },
      { frequency: 8000, gain: 2, q: 0.7, type: "highShelf" },
    ],
    compression: { threshold: -14, ratio: 3, attack: 15, release: 100 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 100,
        threshold: -16,
        ratio: 3,
        attack: 20,
        release: 140,
        knee: 5,
        makeupGain: 2,
      },
      {
        lowFreq: 100,
        highFreq: 500,
        threshold: -14,
        ratio: 2.5,
        attack: 15,
        release: 100,
        knee: 4,
        makeupGain: 1,
      },
      {
        lowFreq: 500,
        highFreq: 2000,
        threshold: -12,
        ratio: 2,
        attack: 10,
        release: 80,
        knee: 4,
        makeupGain: 0,
      },
      {
        lowFreq: 2000,
        highFreq: 8000,
        threshold: -15,
        ratio: 2.5,
        attack: 8,
        release: 60,
        knee: 3,
        makeupGain: 1,
      },
      {
        lowFreq: 8000,
        highFreq: 20000,
        threshold: -18,
        ratio: 2,
        attack: 5,
        release: 50,
        knee: 3,
        makeupGain: 0.5,
      },
    ],
    stereoWidth: 1.15,
    limiterCeiling: -0.3,
    characteristics: ["warm", "smooth", "deep bass", "silky"],
  },
  metal: {
    name: "metal",
    description: "Aggressive, tight, powerful",
    targetLUFS: -9,
    truePeak: -0.3,
    eq: [
      { frequency: 60, gain: 2, q: 0.9, type: "lowShelf" },
      { frequency: 200, gain: -2, q: 1.5, type: "peak" },
      { frequency: 500, gain: -1, q: 1.0, type: "peak" },
      { frequency: 2500, gain: 3, q: 1.2, type: "peak" },
      { frequency: 5000, gain: 2, q: 1.0, type: "peak" },
      { frequency: 10000, gain: 1, q: 0.8, type: "highShelf" },
    ],
    compression: { threshold: -12, ratio: 5, attack: 10, release: 80 },
    multibandSettings: [
      {
        lowFreq: 0,
        highFreq: 100,
        threshold: -15,
        ratio: 4,
        attack: 15,
        release: 100,
        knee: 4,
        makeupGain: 2,
      },
      {
        lowFreq: 100,
        highFreq: 400,
        threshold: -14,
        ratio: 3.5,
        attack: 12,
        release: 80,
        knee: 3,
        makeupGain: 1,
      },
      {
        lowFreq: 400,
        highFreq: 2000,
        threshold: -12,
        ratio: 3,
        attack: 8,
        release: 60,
        knee: 3,
        makeupGain: 0.5,
      },
      {
        lowFreq: 2000,
        highFreq: 6000,
        threshold: -13,
        ratio: 3.5,
        attack: 5,
        release: 50,
        knee: 2,
        makeupGain: 1.5,
      },
      {
        lowFreq: 6000,
        highFreq: 20000,
        threshold: -16,
        ratio: 2.5,
        attack: 3,
        release: 40,
        knee: 2,
        makeupGain: 0.5,
      },
    ],
    stereoWidth: 1.25,
    limiterCeiling: -0.3,
    characteristics: ["aggressive", "tight", "powerful", "crushing"],
  },
};

// ============================================================================
// INTELLIGENT MASTERING ENGINE CLASS
// ============================================================================

export class IntelligentMasteringEngine {
  private sampleRate: number;

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate;
  }

  /**
   * Analyze audio for mastering decisions
   */
  public analyzeForMastering(
    audioData: Float32Array,
    sampleRate?: number,
  ): MasteringAnalysis {
    const sr = sampleRate || this.sampleRate;

    const spectral = extractSpectralFeatures(audioData, sr);
    const dynamics = extractDynamicFeatures(audioData, sr);
    const rhythm = extractRhythmFeatures(audioData, sr);
    const timbre = extractTimbreFeatures(audioData, sr);

    const currentLUFS = this.calculateLUFS(audioData, sr);
    const currentPeak = this.calculatePeakDB(audioData);
    const dynamicRange = this.calculateDynamicRange(audioData, sr);
    const stereoWidth = this.calculateStereoWidth(audioData);
    const stereoBalanceDb = this.calculateStereoBalance(audioData);
    const frequencyBalance = this.analyzeFrequencyBalance(audioData, sr);

    const issues = this.detectIssues(
      spectral,
      dynamics,
      currentLUFS,
      stereoWidth,
      frequencyBalance,
      stereoBalanceDb,
    );
    const recommendations = this.generateRecommendations(
      issues,
      spectral,
      dynamics,
    );

    return {
      spectral,
      dynamics,
      rhythm,
      timbre,
      currentLUFS,
      currentPeak,
      dynamicRange,
      stereoWidth,
      stereoBalanceDb,
      frequencyBalance,
      issues,
      recommendations,
    };
  }

  /**
   * Get genre-specific mastering preset
   */
  public getGenrePreset(genre: MasteringGenre): GenrePreset {
    return { ...GENRE_PRESETS[genre] };
  }

  /**
   * Get all available genre presets
   */
  public getAllGenrePresets(): Record<MasteringGenre, GenrePreset> {
    return { ...GENRE_PRESETS };
  }

  /**
   * Master a track with full processing chain
   */
  public masterTrack(
    audioData: Float32Array,
    config: MasteringChainConfig,
    sampleRate?: number,
  ): Float32Array {
    const sr = sampleRate || this.sampleRate;
    // Declare with ArrayBufferLike so private helpers (TS 5.x Float32Array<ArrayBufferLike>)
    // can be reassigned without type errors.
    let processed: Float32Array<ArrayBufferLike> = new Float32Array(audioData);

    processed = this.applyGain(processed, config.inputGain);

    processed = this.applyEQ(processed, config.eq, sr);

    processed = this.applyMultibandCompression(
      processed,
      config.multibandCompressor,
      sr,
    );

    processed = this.applyStereoProcessing(processed, config.stereo);

    processed = this.applyLoudnessNormalization(processed, config.loudness, sr);

    processed = this.applyLimiter(processed, config.limiter, sr);

    processed = this.applyGain(processed, config.outputGain);

    if (config.dithering && config.bitDepth < 32) {
      processed = this.applyDithering(processed, config.bitDepth);
    }

    // ── Post-render verification loops ──────────────────────────────────
    // 1. Stereo-balance auto-correction: re-measure after the chain; if the
    //    render drifted beyond 0.5 dB L/R, correct and re-run the tail
    //    (stereo -> limiter) so the shipped master is centered. Stands down
    //    when the caller set midSideBalance explicitly (manual control wins).
    // 2. True-peak enforcement: the benchmark caught a master shipping at
    //    0.0 dBTP despite a -1.0 clamp default. Re-measure true peak after
    //    render; if above target, trim and re-limit (max 3 passes).
    const tpTarget = config.loudness.truePeak;
    const manualBalance = Math.abs(config.stereo.midSideBalance || 0) > 0.01;
    for (let pass = 0; pass < 3; pass++) {
      const balanceDb = this.calculateStereoBalance(processed);
      const tp = this.calculateTruePeakDB(processed);
      const needBalance = !manualBalance && Math.abs(balanceDb) > 0.5;
      const needTp = tp > tpTarget;
      if (!needBalance && !needTp) break;

      if (needBalance) {
        processed = this.applyBalanceCorrection(processed, balanceDb);
      }
      if (needTp) {
        const excess = tp - tpTarget;
        processed = this.applyGain(processed, -excess - 0.1);
      }
      // Re-run the tail so corrections are limited and normalized.
      processed = this.applyStereoProcessing(processed, config.stereo);
      processed = this.applyLoudnessNormalization(processed, config.loudness, sr);
      processed = this.applyLimiter(
        processed,
        { ...config.limiter, ceiling: Math.min(config.limiter.ceiling, tpTarget) },
        sr,
      );
      processed = this.applyGain(processed, config.outputGain);
    }

    return processed as Float32Array;
  }

  /**
   * Match audio to a reference track
   */
  public matchReference(
    targetAudio: Float32Array,
    referenceAudio: Float32Array,
    sampleRate?: number,
  ): ReferenceMatchResult {
    const sr = sampleRate || this.sampleRate;

    const targetAnalysis = this.analyzeForMastering(targetAudio, sr);
    const referenceAnalysis = this.analyzeForMastering(referenceAudio, sr);

    const loudnessAdjustment =
      referenceAnalysis.currentLUFS - targetAnalysis.currentLUFS;

    const eqCurve = this.calculateMatchingEQ(targetAnalysis, referenceAnalysis);

    const stereoAdjustment =
      referenceAnalysis.stereoWidth / Math.max(targetAnalysis.stereoWidth, 0.1);

    const dynamicsAdjustment = this.calculateDynamicsMatch(
      targetAnalysis,
      referenceAnalysis,
    );

    const matchConfidence = this.calculateMatchConfidence(
      targetAnalysis,
      referenceAnalysis,
    );

    return {
      loudnessAdjustment,
      eqCurve,
      stereoAdjustment: Math.min(Math.max(stereoAdjustment, 0.5), 2.0),
      dynamicsAdjustment,
      matchConfidence,
    };
  }

  // ============================================================================
  // PRIVATE ANALYSIS METHODS
  // ============================================================================

  private calculateLUFS(audioData: Float32Array, sampleRate: number): number {
    // Block/hop are in audio frames (BS.1770: 400 ms blocks, 100 ms hop).
    const blockFrames = Math.floor(0.4 * sampleRate);
    const hopFrames = Math.floor(0.1 * sampleRate);
    const frames = Math.floor(audioData.length / 2);
    const powers: number[] = [];

    for (let f = 0; f + blockFrames <= frames; f += hopFrames) {
      const block = audioData.slice(f * 2, (f + blockFrames) * 2);
      const kWeighted = this.applyKWeighting(block, sampleRate);
      // BS.1770: block energy is the SUM over channels of per-channel
      // mean squares (not the mean over interleaved samples — that reads
      // 3 dB low on stereo).
      let z = 0;
      for (let ch = 0; ch < 2; ch++) {
        let sum = 0;
        let n = 0;
        for (let j = ch; j < kWeighted.length; j += 2) {
          const v = kWeighted[j];
          sum += v * v;
          n++;
        }
        if (n > 0) z += sum / n;
      }
      if (z > 0) powers.push(z);
    }

    if (powers.length === 0) return -70;

    const toLUFS = (p: number) => -0.691 + 10 * Math.log10(p);
    const meanPower = (ps: number[]) =>
      ps.reduce((sum, p) => sum + p, 0) / (ps.length || 1);

    // BS.1770 gating: absolute gate at -70 LUFS, then relative gate at -10 LU.
    // (The previous implementation used a 10th-percentile * 10 approximation
    // that discarded every block on steady-state signals.)
    const absGated = powers.filter((p) => toLUFS(p) >= -70);
    if (absGated.length === 0) return -70;
    const ungatedLUFS = toLUFS(meanPower(absGated));
    const relGated = absGated.filter((p) => toLUFS(p) >= ungatedLUFS - 10);
    if (relGated.length === 0) return -70;

    return toLUFS(meanPower(relGated));
  }

  /**
   * ITU-R BS.1770 K-weighting: pre-filter (high shelf) + RLB (high-pass).
   *
   * Coefficients are the BS.1770-4 spec biquads (defined at 48 kHz), warped
   * to the actual sample rate via a bilinear-transform round-trip on the
   * poles and zeros with gain matched at 1 kHz. Measured max deviation from
   * the spec curve: 0.002 dB at 44.1 kHz (0 at 48 kHz, where the spec values
   * are returned directly).
   *
   * NOTE (2026-10-02): the previous implementation used a mis-derived
   * first-order recurrence whose transfer function resonated ~+51 dB at
   * Nyquist. On full-bandwidth audio its output exploded, so every
   * downstream LUFS value was meaningless — loudness issue detection
   * always fired, loudness normalization computed a hugely negative gain
   * (attenuating toward silence), and reference loudness matching was
   * garbage. This replaces it with the standard filter.
   */
  private static kWeightingStages(
    sampleRate: number,
  ): Array<[number, number, number, number, number]> {
    // Each stage is [b0, b1, b2, a1, a2] with a0 normalized to 1.
    const SPEC_48K: Array<{
      b: [number, number, number];
      a: [number, number, number];
    }> = [
      // Pre-filter high shelf
      {
        b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
        a: [1.0, -1.69065929318241, 0.73248077421585],
      },
      // RLB high-pass
      {
        b: [1.0, -2.0, 1.0],
        a: [1.0, -1.99004745483398, 0.99007225036621],
      },
    ];
    return SPEC_48K.map(({ b, a }) =>
      IntelligentMasteringEngine.warpBiquad48k(b, a, sampleRate),
    );
  }

  /** Warp one 48 kHz spec biquad to the target rate; returns [b0,b1,b2,a1,a2]. */
  private static warpBiquad48k(
    b: [number, number, number],
    a: [number, number, number],
    fs2: number,
  ): [number, number, number, number, number] {
    const fs1 = 48000;
    if (fs2 === fs1) {
      return [b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]];
    }
    type C = { re: number; im: number };
    const add = (p: C, q: C): C => ({ re: p.re + q.re, im: p.im + q.im });
    const sub = (p: C, q: C): C => ({ re: p.re - q.re, im: p.im - q.im });
    const mul = (p: C, q: C): C => ({
      re: p.re * q.re - p.im * q.im,
      im: p.re * q.im + p.im * q.re,
    });
    const div = (p: C, q: C): C => {
      const d = q.re * q.re + q.im * q.im;
      return {
        re: (p.re * q.re + p.im * q.im) / d,
        im: (p.im * q.re - p.re * q.im) / d,
      };
    };
    const one: C = { re: 1, im: 0 };
    // Roots of c0*z^2 + c1*z + c2 = 0.
    const roots = (c0: number, c1: number, c2: number): [C, C] => {
      const disc = c1 * c1 - 4 * c0 * c2;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        return [
          { re: (-c1 + s) / (2 * c0), im: 0 },
          { re: (-c1 - s) / (2 * c0), im: 0 },
        ];
      }
      const s = Math.sqrt(-disc);
      return [
        { re: -c1 / (2 * c0), im: s / (2 * c0) },
        { re: -c1 / (2 * c0), im: -s / (2 * c0) },
      ];
    };
    const T1 = 1 / fs1;
    const T2 = 1 / fs2;
    // s = (2/T1)(z-1)/(z+1); z = (1+sT2/2)/(1-sT2/2)
    const d2a = (z: C): C =>
      mul({ re: 2 / T1, im: 0 }, div(sub(z, one), add(z, one)));
    const a2d = (s: C): C => {
      const h = mul({ re: T2 / 2, im: 0 }, s);
      return div(add(one, h), sub(one, h));
    };
    const zq = roots(b[0], b[1], b[2]).map(d2a).map(a2d);
    const zp = roots(a[0], a[1], a[2]).map(d2a).map(a2d);
    // Gain-match the warped filter to the spec filter at 1 kHz.
    const resp = (c: [number, number, number], w: number): C => ({
      re: c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w),
      im: -(c[1] * Math.sin(w) + c[2] * Math.sin(2 * w)),
    });
    const w1 = (2 * Math.PI * 1000) / fs1;
    const w2 = (2 * Math.PI * 1000) / fs2;
    const specResp = div(resp(b, w1), resp(a, w1));
    const specMag = Math.hypot(specResp.re, specResp.im);
    const zr: C = { re: Math.cos(w2), im: Math.sin(w2) };
    const rawResp = div(
      mul(sub(zr, zq[0]), sub(zr, zq[1])),
      mul(sub(zr, zp[0]), sub(zr, zp[1])),
    );
    const K = specMag / Math.hypot(rawResp.re, rawResp.im);
    // K*(z-zq0)(z-zq1) / ((z-zp0)(z-zp1)); conjugate pairs keep coeffs real.
    const qsum = add(zq[0], zq[1]);
    const qprod = mul(zq[0], zq[1]);
    const psum = add(zp[0], zp[1]);
    const pprod = mul(zp[0], zp[1]);
    return [K, -K * qsum.re, K * qprod.re, -psum.re, pprod.re];
  }

  private applyKWeighting(
    audioData: Float32Array,
    sampleRate: number,
  ): Float32Array {
    const stages = IntelligentMasteringEngine.kWeightingStages(sampleRate);
    const result = new Float32Array(audioData.length);
    // De-interleave so each channel keeps independent Direct-Form-I state
    // (BS.1770 filters per channel). A trailing odd sample is treated as mono.
    const frames = Math.ceil(audioData.length / 2);
    for (let ch = 0; ch < 2; ch++) {
      const state = stages.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
      for (let i = 0; i < frames; i++) {
        const idx = i * 2 + ch;
        if (idx >= audioData.length) break;
        let v = audioData[idx];
        for (let s = 0; s < stages.length; s++) {
          const [b0, b1, b2, a1, a2] = stages[s];
          const st = state[s];
          const y0 = b0 * v + b1 * st.x1 + b2 * st.x2 - a1 * st.y1 - a2 * st.y2;
          st.x2 = st.x1;
          st.x1 = v;
          st.y2 = st.y1;
          st.y1 = y0;
          v = y0;
        }
        result[idx] = v;
      }
    }
    return result;
  }

  private calculatePeakDB(audioData: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < audioData.length; i++) {
      peak = Math.max(peak, Math.abs(audioData[i]));
    }
    return peak > 0 ? 20 * Math.log10(peak) : -96;
  }

  private calculateDynamicRange(
    audioData: Float32Array,
    sampleRate: number,
  ): number {
    const windowSize = Math.floor(0.05 * sampleRate);
    const rmsValues: number[] = [];

    for (let i = 0; i < audioData.length - windowSize; i += windowSize / 2) {
      const window = audioData.slice(i, i + windowSize);
      let sumSquares = 0;
      for (let j = 0; j < window.length; j++) {
        sumSquares += window[j] * window[j];
      }
      const rms = Math.sqrt(sumSquares / (window.length || 1));
      if (rms > 0.0001) {
        rmsValues.push(20 * Math.log10(rms));
      }
    }

    if (rmsValues.length < 10) return 0;

    rmsValues.sort((a, b) => a - b);
    const p95 = rmsValues[Math.floor(rmsValues.length * 0.95)];
    const p5 = rmsValues[Math.floor(rmsValues.length * 0.05)];

    return p95 - p5;
  }

  private calculateStereoWidth(audioData: Float32Array): number {
    if (audioData.length < 2) return 0;

    let midEnergy = 0;
    let sideEnergy = 0;

    for (let i = 0; i < audioData.length - 1; i += 2) {
      const left = audioData[i];
      const right = audioData[i + 1];
      const mid = (left + right) / 2;
      const side = (left - right) / 2;
      midEnergy += mid * mid;
      sideEnergy += side * side;
    }

    const totalEnergy = midEnergy + sideEnergy;
    if (totalEnergy === 0) return 0;

    return sideEnergy / (totalEnergy || 1);
  }

  /**
   * L/R balance in dB. Positive = left-heavy, negative = right-heavy.
   * The benchmark caught a 1.31 dB right-heavy master shipping uncorrected.
   */
  public calculateStereoBalance(audioData: Float32Array): number {
    if (audioData.length < 2) return 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = 0; i < audioData.length - 1; i += 2) {
      leftEnergy += audioData[i] * audioData[i];
      rightEnergy += audioData[i + 1] * audioData[i + 1];
    }
    if (leftEnergy === 0 || rightEnergy === 0) return 0;
    return 10 * Math.log10(leftEnergy / rightEnergy);
  }

  /**
   * True-peak estimate in dBFS via 4x linear-interpolation oversampling.
   * Catches inter-sample peaks missed by sample-peak measurement. Linear
   * interpolation slightly underestimates vs. a polyphase FIR; treat as a
   * safety estimate, not a certified BS.1770 reading.
   */
  public calculateTruePeakDB(audioData: Float32Array): number {
    if (audioData.length < 2) return -Infinity;
    let peak = 0;
    const frames = Math.floor(audioData.length / 2);
    for (let f = 0; f < frames - 1; f++) {
      for (let ch = 0; ch < 2; ch++) {
        const a = audioData[f * 2 + ch];
        const b = audioData[(f + 1) * 2 + ch];
        const aa = Math.abs(a);
        if (aa > peak) peak = aa;
        // 3 interpolated inter-sample positions (4x oversampling)
        for (let k = 1; k < 4; k++) {
          const v = Math.abs(a + ((b - a) * k) / 4);
          if (v > peak) peak = v;
        }
      }
    }
    if (peak <= 0) return -Infinity;
    return 20 * Math.log10(peak);
  }

  /**
   * Apply a static L/R balance correction from a measured imbalance in dB.
   * Symmetric equal-and-opposite gains zero the measured imbalance while
   * preserving overall level; the downstream limiter + true-peak loop
   * guarantee ceiling safety. Used by the auto-correction loop.
   */
  private applyBalanceCorrection(
    audioData: Float32Array,
    balanceDb: number,
  ): Float32Array {
    if (Math.abs(balanceDb) < 0.05) return audioData;
    const gainL = Math.pow(10, -balanceDb / 40);
    const gainR = Math.pow(10, balanceDb / 40);
    const result = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length - 1; i += 2) {
      result[i] = audioData[i] * gainL;
      result[i + 1] = audioData[i + 1] * gainR;
    }
    if (audioData.length % 2 === 1) {
      result[audioData.length - 1] = audioData[audioData.length - 1];
    }
    return result;
  }

  private analyzeFrequencyBalance(
    audioData: Float32Array,
    sampleRate: number,
  ): MasteringAnalysis["frequencyBalance"] {
    const fftSize = 4096;
    const numBins = fftSize / 2;
    const binWidth = sampleRate / fftSize;

    const spectrum = this.computeSpectrum(audioData.slice(0, fftSize));

    const bandEnergies = {
      sub: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      presence: 0,
      brilliance: 0,
    };
    const bands = [
      { name: "sub" as const, low: 20, high: 60 },
      { name: "bass" as const, low: 60, high: 250 },
      { name: "lowMid" as const, low: 250, high: 500 },
      { name: "mid" as const, low: 500, high: 2000 },
      { name: "highMid" as const, low: 2000, high: 4000 },
      { name: "presence" as const, low: 4000, high: 8000 },
      { name: "brilliance" as const, low: 8000, high: 20000 },
    ];

    for (const band of bands) {
      const lowBin = Math.floor(band.low / binWidth);
      const highBin = Math.min(Math.floor(band.high / binWidth), numBins - 1);

      for (let i = lowBin; i <= highBin; i++) {
        bandEnergies[band.name] += spectrum[i] * spectrum[i];
      }
    }

    const total = Object.values(bandEnergies).reduce((a, b) => a + b, 0) || 1;

    return {
      sub: bandEnergies.sub / (total || 1),
      bass: bandEnergies.bass / (total || 1),
      lowMid: bandEnergies.lowMid / (total || 1),
      mid: bandEnergies.mid / (total || 1),
      highMid: bandEnergies.highMid / (total || 1),
      presence: bandEnergies.presence / (total || 1),
      brilliance: bandEnergies.brilliance / (total || 1),
    };
  }

  private computeSpectrum(audioData: Float32Array): Float32Array {
    const n = audioData.length;
    const result = new Float32Array(n / 2);

    for (let k = 0; k < n / 2; k++) {
      let real = 0;
      let imag = 0;

      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        real += audioData[t] * Math.cos(angle);
        imag -= audioData[t] * Math.sin(angle);
      }

      result[k] = Math.sqrt(real * real + imag * imag);
    }

    return result;
  }

  private detectIssues(
    _spectral: SpectralFeatures,
    dynamics: DynamicFeatures,
    currentLUFS: number,
    stereoWidth: number,
    frequencyBalance: MasteringAnalysis["frequencyBalance"],
    stereoBalanceDb: number = 0,
  ): MasteringIssue[] {
    const issues: MasteringIssue[] = [];

    if (Math.abs(stereoBalanceDb) > 0.5) {
      issues.push({
        type: "stereo",
        severity: Math.abs(stereoBalanceDb) > 1.0 ? "high" : "medium",
        description:
          `L/R imbalance of ${stereoBalanceDb.toFixed(2)} dB detected ` +
          `(${stereoBalanceDb > 0 ? "left" : "right"}-heavy)`,
        suggestedFix:
          "Auto-correction applied in the mastering chain (midSideBalance)",
      });
    }


    if (frequencyBalance.bass > 0.4) {
      issues.push({
        type: "frequency",
        severity: "medium",
        description: "Excessive bass energy detected",
        suggestedFix:
          "Apply high-pass filter around 30-40 Hz and reduce low shelf",
      });
    }

    if (frequencyBalance.brilliance < 0.05) {
      issues.push({
        type: "frequency",
        severity: "low",
        description: "Lacking high-frequency content",
        suggestedFix: "Consider adding high shelf boost around 10-12 kHz",
      });
    }

    if (dynamics.dynamicRange > 20) {
      issues.push({
        type: "dynamics",
        severity: "medium",
        description:
          "Very high dynamic range may cause issues on some playback systems",
        suggestedFix: "Apply gentle compression to control dynamics",
      });
    }

    if (dynamics.dynamicRange < 4) {
      issues.push({
        type: "dynamics",
        severity: "high",
        description: "Over-compressed, lacking dynamics",
        suggestedFix:
          "Consider reducing compression or using parallel compression",
      });
    }

    if (stereoWidth > 0.6) {
      issues.push({
        type: "stereo",
        severity: "low",
        description:
          "Very wide stereo image may cause mono compatibility issues",
        suggestedFix:
          "Check mono compatibility and consider narrowing below 150 Hz",
      });
    }

    if (stereoWidth < 0.1) {
      issues.push({
        type: "stereo",
        severity: "low",
        description: "Very narrow stereo image",
        suggestedFix: "Consider stereo widening techniques",
      });
    }

    if (currentLUFS > -6) {
      issues.push({
        type: "loudness",
        severity: "high",
        description: "Loudness exceeds streaming platform limits",
        suggestedFix: "Reduce overall level to meet platform requirements",
      });
    }

    return issues;
  }

  private generateRecommendations(
    issues: MasteringIssue[],
    spectral: SpectralFeatures,
    dynamics: DynamicFeatures,
  ): string[] {
    const recommendations: string[] = [];

    for (const issue of issues) {
      recommendations.push(issue.suggestedFix);
    }

    if (spectral.brightness < 0.3) {
      recommendations.push("Consider adding air/brightness with high shelf EQ");
    }

    if (spectral.bassPresence > 0.5) {
      recommendations.push("Bass-heavy mix: ensure proper low-end management");
    }

    if (dynamics.crestFactor > 12) {
      recommendations.push(
        "High crest factor suggests good transient preservation",
      );
    }

    return recommendations;
  }

  private calculateMatchingEQ(
    target: MasteringAnalysis,
    reference: MasteringAnalysis,
  ): EQBand[] {
    const eqCurve: EQBand[] = [];

    const bands = [
      { freq: 40, key: "sub" as const },
      { freq: 120, key: "bass" as const },
      { freq: 350, key: "lowMid" as const },
      { freq: 1000, key: "mid" as const },
      { freq: 3000, key: "highMid" as const },
      { freq: 6000, key: "presence" as const },
      { freq: 12000, key: "brilliance" as const },
    ];

    for (const band of bands) {
      const targetEnergy = target.frequencyBalance[band.key];
      const refEnergy = reference.frequencyBalance[band.key];
      const ratio = refEnergy / Math.max(targetEnergy, 0.001);
      const gain = 10 * Math.log10(ratio);

      if (Math.abs(gain) > 0.5) {
        eqCurve.push({
          frequency: band.freq,
          gain: Math.max(-6, Math.min(6, gain)),
          q: 1.0,
          type:
            band.freq < 100
              ? "lowShelf"
              : band.freq > 8000
                ? "highShelf"
                : "peak",
        });
      }
    }

    return eqCurve;
  }

  private calculateDynamicsMatch(
    target: MasteringAnalysis,
    reference: MasteringAnalysis,
  ): { threshold: number; ratio: number } {
    const dynamicDiff = target.dynamicRange - reference.dynamicRange;

    if (dynamicDiff > 3) {
      return { threshold: -15, ratio: 3 };
    } else if (dynamicDiff < -3) {
      return { threshold: -24, ratio: 1.5 };
    }

    return { threshold: -18, ratio: 2 };
  }

  private calculateMatchConfidence(
    target: MasteringAnalysis,
    reference: MasteringAnalysis,
  ): number {
    let similarity = 0;

    const lufsDiff = Math.abs(target.currentLUFS - reference.currentLUFS);
    similarity += Math.max(0, 1 - lufsDiff / 20) * 0.3;

    const dynamicDiff = Math.abs(target.dynamicRange - reference.dynamicRange);
    similarity += Math.max(0, 1 - dynamicDiff / 15) * 0.3;

    const widthDiff = Math.abs(target.stereoWidth - reference.stereoWidth);
    similarity += Math.max(0, 1 - widthDiff / 0.5) * 0.2;

    let freqSimilarity = 0;
    const keys: (keyof MasteringAnalysis["frequencyBalance"])[] = [
      "sub",
      "bass",
      "lowMid",
      "mid",
      "highMid",
      "presence",
      "brilliance",
    ];
    for (const key of keys) {
      const diff = Math.abs(
        target.frequencyBalance[key] - reference.frequencyBalance[key],
      );
      freqSimilarity += Math.max(0, 1 - diff / 0.3);
    }
    similarity += (freqSimilarity / (keys.length || 1)) * 0.2;

    return Math.min(similarity, 1);
  }

  // ============================================================================
  // PRIVATE PROCESSING METHODS
  // ============================================================================

  private applyGain(audioData: Float32Array, gainDB: number): Float32Array {
    const gainLinear = Math.pow(10, gainDB / 20);
    const result = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      result[i] = audioData[i] * gainLinear;
    }
    return result;
  }

  private applyEQ(
    audioData: Float32Array,
    bands: EQBand[],
    sampleRate: number,
  ): Float32Array {
    let result: Float32Array<ArrayBufferLike> = new Float32Array(audioData);

    for (const band of bands) {
      result = this.applyBiquadFilter(result, band, sampleRate);
    }

    return result as Float32Array;
  }

  private applyBiquadFilter(
    audioData: Float32Array,
    band: EQBand,
    sampleRate: number,
  ): Float32Array {
    const result = new Float32Array(audioData.length);
    const omega = (2 * Math.PI * band.frequency) / sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * band.q);
    const A = Math.pow(10, band.gain / 40);

    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

    switch (band.type) {
      case "peak":
        b0 = 1 + alpha * A;
        b1 = -2 * cosOmega;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha / A;
        break;
      case "lowShelf":
        const sqrtA = Math.sqrt(A);
        b0 = A * (A + 1 - (A - 1) * cosOmega + 2 * sqrtA * alpha);
        b1 = 2 * A * (A - 1 - (A + 1) * cosOmega);
        b2 = A * (A + 1 - (A - 1) * cosOmega - 2 * sqrtA * alpha);
        a0 = A + 1 + (A - 1) * cosOmega + 2 * sqrtA * alpha;
        a1 = -2 * (A - 1 + (A + 1) * cosOmega);
        a2 = A + 1 + (A - 1) * cosOmega - 2 * sqrtA * alpha;
        break;
      case "highShelf":
        const sqrtAh = Math.sqrt(A);
        b0 = A * (A + 1 + (A - 1) * cosOmega + 2 * sqrtAh * alpha);
        b1 = -2 * A * (A - 1 + (A + 1) * cosOmega);
        b2 = A * (A + 1 + (A - 1) * cosOmega - 2 * sqrtAh * alpha);
        a0 = A + 1 - (A - 1) * cosOmega + 2 * sqrtAh * alpha;
        a1 = 2 * (A - 1 - (A + 1) * cosOmega);
        a2 = A + 1 - (A - 1) * cosOmega - 2 * sqrtAh * alpha;
        break;
      case "lowPass":
        b0 = (1 - cosOmega) / 2;
        b1 = 1 - cosOmega;
        b2 = (1 - cosOmega) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha;
        break;
      case "highPass":
        b0 = (1 + cosOmega) / 2;
        b1 = -(1 + cosOmega);
        b2 = (1 + cosOmega) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha;
        break;
      default:
        return audioData;
    }

    b0 /= a0;
    b1 /= a0;
    b2 /= a0;
    a1 /= a0;
    a2 /= a0;

    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < audioData.length; i++) {
      const x0 = audioData[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      result[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }

    return result;
  }

  private applyMultibandCompression(
    audioData: Float32Array,
    bands: MultibandCompressorBand[],
    sampleRate: number,
  ): Float32Array {
    const result = new Float32Array(audioData.length);

    const bandSignals: Float32Array[] = [];
    for (const band of bands) {
      const filtered = this.isolateBand(
        audioData,
        band.lowFreq,
        band.highFreq,
        sampleRate,
      );
      const compressed = this.compressBand(filtered, band);
      bandSignals.push(compressed);
    }

    for (let i = 0; i < result.length; i++) {
      result[i] = 0;
      for (const bandSignal of bandSignals) {
        result[i] += bandSignal[i];
      }
    }

    return result;
  }

  private isolateBand(
    audioData: Float32Array,
    lowFreq: number,
    highFreq: number,
    sampleRate: number,
  ): Float32Array {
    let result: Float32Array<ArrayBufferLike> = new Float32Array(audioData);

    if (lowFreq > 20) {
      result = this.applyBiquadFilter(
        result,
        {
          frequency: lowFreq,
          gain: 0,
          q: 0.707,
          type: "highPass",
        },
        sampleRate,
      );
    }

    if (highFreq < 20000) {
      result = this.applyBiquadFilter(
        result,
        {
          frequency: highFreq,
          gain: 0,
          q: 0.707,
          type: "lowPass",
        },
        sampleRate,
      );
    }

    return result;
  }

  private compressBand(
    audioData: Float32Array,
    band: MultibandCompressorBand,
  ): Float32Array {
    const result = new Float32Array(audioData.length);
    const thresholdLinear = Math.pow(10, band.threshold / 20);
    const makeupLinear = Math.pow(10, band.makeupGain / 20);

    const attackCoef = Math.exp(-1 / (band.attack * 0.001 * this.sampleRate));
    const releaseCoef = Math.exp(-1 / (band.release * 0.001 * this.sampleRate));

    let envelope = 0;

    for (let i = 0; i < audioData.length; i++) {
      const inputAbs = Math.abs(audioData[i]);

      if (inputAbs > envelope) {
        envelope = attackCoef * envelope + (1 - attackCoef) * inputAbs;
      } else {
        envelope = releaseCoef * envelope + (1 - releaseCoef) * inputAbs;
      }

      let gain = 1;
      if (envelope > thresholdLinear) {
        const overThreshold = envelope / thresholdLinear;
        const kneeDB = band.knee;
        const kneeLinear = Math.pow(10, kneeDB / 20);

        if (overThreshold < kneeLinear) {
          const kneeRatio =
            1 + ((band.ratio - 1) * (overThreshold - 1)) / (kneeLinear - 1);
          gain = 1 / Math.pow(overThreshold, 1 - 1 / kneeRatio);
        } else {
          gain = 1 / Math.pow(overThreshold, 1 - 1 / band.ratio);
        }
      }

      result[i] = audioData[i] * gain * makeupLinear;
    }

    return result;
  }

  private applyStereoProcessing(
    audioData: Float32Array,
    settings: StereoSettings,
  ): Float32Array {
    const result = new Float32Array(audioData.length);

    // Manual balance control (-1..1): equal-and-opposite channel gains.
    const balDb = (settings.midSideBalance || 0) * 6;
    const gainL = Math.pow(10, -balDb / 40);
    const gainR = Math.pow(10, balDb / 40);

    for (let i = 0; i < audioData.length - 1; i += 2) {
      const left = audioData[i] * gainL;
      const right = audioData[i + 1] * gainR;

      const mid = (left + right) / 2;
      const side = (left - right) / 2;

      const adjustedSide = side * settings.width;

      result[i] = mid + adjustedSide;
      result[i + 1] = mid - adjustedSide;
    }

    return result;
  }

  private applyLoudnessNormalization(
    audioData: Float32Array,
    settings: LoudnessSettings,
    sampleRate: number,
  ): Float32Array {
    const currentLUFS = this.calculateLUFS(audioData, sampleRate);
    const gainNeeded = settings.targetLUFS - currentLUFS;

    const gainLimited = Math.min(gainNeeded, 12);

    return this.applyGain(audioData, gainLimited);
  }

  private applyLimiter(
    audioData: Float32Array,
    settings: LimiterSettings,
    sampleRate: number,
  ): Float32Array {
    const result = new Float32Array(audioData.length);
    const ceilingLinear = Math.pow(10, settings.ceiling / 20);
    const releaseCoef = Math.exp(-1 / (settings.release * 0.001 * sampleRate));
    const lookaheadSamples = Math.floor(
      settings.lookahead * 0.001 * sampleRate,
    );

    let gainReduction = 1;

    for (let i = 0; i < audioData.length; i++) {
      let peakAhead = Math.abs(audioData[i]);
      for (let j = 1; j < lookaheadSamples && i + j < audioData.length; j++) {
        peakAhead = Math.max(peakAhead, Math.abs(audioData[i + j]));
      }

      const targetGain =
        peakAhead > ceilingLinear ? ceilingLinear / peakAhead : 1;

      if (targetGain < gainReduction) {
        gainReduction = targetGain;
      } else {
        gainReduction =
          releaseCoef * gainReduction + (1 - releaseCoef) * targetGain;
      }

      let sample = audioData[i] * gainReduction;

      if (settings.softClip && Math.abs(sample) > ceilingLinear * 0.9) {
        const threshold = ceilingLinear * 0.9;
        if (sample > threshold) {
          sample =
            threshold +
            (1 -
              Math.exp(-(sample - threshold) / (ceilingLinear - threshold))) *
              (ceilingLinear - threshold);
        } else if (sample < -threshold) {
          sample =
            -threshold -
            (1 -
              Math.exp(-(-sample - threshold) / (ceilingLinear - threshold))) *
              (ceilingLinear - threshold);
        }
      }

      result[i] = Math.max(-ceilingLinear, Math.min(ceilingLinear, sample));
    }

    return result;
  }

  private applyDithering(
    audioData: Float32Array,
    bitDepth: number,
  ): Float32Array {
    const result = new Float32Array(audioData.length);
    const levels = Math.pow(2, bitDepth - 1);
    const ditherAmount = 1 / levels;

    for (let i = 0; i < audioData.length; i++) {
      const noise = (Math.random() - 0.5) * ditherAmount;
      const dithered = audioData[i] + noise;
      const quantized = Math.round(dithered * levels) / levels;
      result[i] = quantized;
    }

    return result;
  }
}
