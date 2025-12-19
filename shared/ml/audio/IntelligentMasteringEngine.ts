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
  type TimbreFeatures
} from './AudioFeatureExtractor.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MasteringGenre = 'hip-hop' | 'electronic' | 'pop' | 'rock' | 'jazz' | 'classical' | 'r&b' | 'metal';

export interface EQBand {
  frequency: number;      // Hz
  gain: number;           // dB (-12 to +12)
  q: number;              // Quality factor (0.1 to 10)
  type: 'lowShelf' | 'highShelf' | 'peak' | 'lowPass' | 'highPass';
}

export interface MultibandCompressorBand {
  lowFreq: number;        // Hz - low crossover
  highFreq: number;       // Hz - high crossover
  threshold: number;      // dB
  ratio: number;          // Compression ratio (1:1 to 20:1)
  attack: number;         // ms
  release: number;        // ms
  knee: number;           // dB
  makeupGain: number;     // dB
}

export interface LimiterSettings {
  ceiling: number;        // dB (typically -0.1 to -0.3)
  release: number;        // ms
  lookahead: number;      // ms
  softClip: boolean;
}

export interface StereoSettings {
  width: number;          // 0-2 (1 = normal, <1 = narrower, >1 = wider)
  bassMonoFreq: number;   // Hz - frequency below which audio is mono
  midSideBalance: number; // -1 to 1 (0 = balanced)
  correlation: number;    // Target correlation (-1 to 1)
}

export interface LoudnessSettings {
  targetLUFS: number;     // Integrated loudness target (-24 to -6)
  truePeak: number;       // dB (typically -1 to 0)
  loudnessRange: number;  // LU (dynamic range target)
  shortTermMax: number;   // dB above integrated
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
  frequencyBalance: {
    sub: number;      // 20-60 Hz
    bass: number;     // 60-250 Hz
    lowMid: number;   // 250-500 Hz
    mid: number;      // 500-2000 Hz
    highMid: number;  // 2000-4000 Hz
    presence: number; // 4000-8000 Hz
    brilliance: number; // 8000-20000 Hz
  };
  issues: MasteringIssue[];
  recommendations: string[];
}

export interface MasteringIssue {
  type: 'frequency' | 'dynamics' | 'stereo' | 'loudness' | 'phase';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedFix: string;
}

export interface ReferenceMatchResult {
  loudnessAdjustment: number;    // dB
  eqCurve: EQBand[];
  stereoAdjustment: number;
  dynamicsAdjustment: {
    threshold: number;
    ratio: number;
  };
  matchConfidence: number;       // 0-1
}

export interface SuggestedSettings {
  genre: MasteringGenre | 'auto';
  config: MasteringChainConfig;
  confidence: number;
  reasoning: string[];
}

// ============================================================================
// GENRE PRESETS
// ============================================================================

const GENRE_PRESETS: Record<MasteringGenre, GenrePreset> = {
  'hip-hop': {
    name: 'hip-hop',
    description: 'Heavy bass, punchy drums, clear vocals',
    targetLUFS: -9,
    truePeak: -0.3,
    eq: [
      { frequency: 40, gain: 3, q: 0.8, type: 'lowShelf' },
      { frequency: 100, gain: 2, q: 1.0, type: 'peak' },
      { frequency: 250, gain: -2, q: 1.5, type: 'peak' },
      { frequency: 3000, gain: 2, q: 1.2, type: 'peak' },
      { frequency: 10000, gain: 1.5, q: 0.7, type: 'highShelf' },
    ],
    compression: { threshold: -12, ratio: 4, attack: 10, release: 100 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 100, threshold: -18, ratio: 3, attack: 20, release: 150, knee: 6, makeupGain: 2 },
      { lowFreq: 100, highFreq: 500, threshold: -15, ratio: 2.5, attack: 15, release: 100, knee: 4, makeupGain: 1 },
      { lowFreq: 500, highFreq: 2000, threshold: -14, ratio: 2, attack: 10, release: 80, knee: 4, makeupGain: 0 },
      { lowFreq: 2000, highFreq: 8000, threshold: -16, ratio: 2.5, attack: 5, release: 60, knee: 3, makeupGain: 1 },
      { lowFreq: 8000, highFreq: 20000, threshold: -20, ratio: 2, attack: 3, release: 50, knee: 3, makeupGain: 0.5 },
    ],
    stereoWidth: 1.1,
    limiterCeiling: -0.3,
    characteristics: ['punchy', 'bass-heavy', 'in-your-face', 'modern'],
  },
  'electronic': {
    name: 'electronic',
    description: 'Clean, loud, wide stereo image',
    targetLUFS: -8,
    truePeak: -0.1,
    eq: [
      { frequency: 30, gain: 2, q: 0.7, type: 'lowShelf' },
      { frequency: 80, gain: 1.5, q: 1.2, type: 'peak' },
      { frequency: 400, gain: -1.5, q: 1.0, type: 'peak' },
      { frequency: 5000, gain: 2.5, q: 1.0, type: 'peak' },
      { frequency: 12000, gain: 3, q: 0.7, type: 'highShelf' },
    ],
    compression: { threshold: -10, ratio: 6, attack: 5, release: 60 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 80, threshold: -15, ratio: 4, attack: 15, release: 120, knee: 4, makeupGain: 2 },
      { lowFreq: 80, highFreq: 400, threshold: -14, ratio: 3, attack: 10, release: 80, knee: 4, makeupGain: 1 },
      { lowFreq: 400, highFreq: 2500, threshold: -12, ratio: 2.5, attack: 5, release: 60, knee: 3, makeupGain: 0 },
      { lowFreq: 2500, highFreq: 8000, threshold: -14, ratio: 3, attack: 3, release: 50, knee: 3, makeupGain: 1.5 },
      { lowFreq: 8000, highFreq: 20000, threshold: -18, ratio: 2.5, attack: 2, release: 40, knee: 2, makeupGain: 1 },
    ],
    stereoWidth: 1.3,
    limiterCeiling: -0.1,
    characteristics: ['loud', 'wide', 'bright', 'punchy'],
  },
  'pop': {
    name: 'pop',
    description: 'Balanced, radio-ready, vocal-focused',
    targetLUFS: -10,
    truePeak: -0.5,
    eq: [
      { frequency: 60, gain: 1, q: 0.8, type: 'lowShelf' },
      { frequency: 200, gain: -1, q: 1.2, type: 'peak' },
      { frequency: 1500, gain: 1, q: 1.0, type: 'peak' },
      { frequency: 4000, gain: 2, q: 1.0, type: 'peak' },
      { frequency: 10000, gain: 2, q: 0.7, type: 'highShelf' },
    ],
    compression: { threshold: -14, ratio: 3, attack: 15, release: 100 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 100, threshold: -16, ratio: 2.5, attack: 20, release: 120, knee: 5, makeupGain: 1 },
      { lowFreq: 100, highFreq: 500, threshold: -14, ratio: 2, attack: 15, release: 100, knee: 4, makeupGain: 0.5 },
      { lowFreq: 500, highFreq: 2000, threshold: -12, ratio: 2, attack: 10, release: 80, knee: 4, makeupGain: 0 },
      { lowFreq: 2000, highFreq: 8000, threshold: -14, ratio: 2.5, attack: 8, release: 60, knee: 3, makeupGain: 1 },
      { lowFreq: 8000, highFreq: 20000, threshold: -18, ratio: 2, attack: 5, release: 50, knee: 3, makeupGain: 0.5 },
    ],
    stereoWidth: 1.15,
    limiterCeiling: -0.5,
    characteristics: ['balanced', 'radio-ready', 'polished', 'accessible'],
  },
  'rock': {
    name: 'rock',
    description: 'Aggressive, dynamic, guitar-forward',
    targetLUFS: -11,
    truePeak: -0.5,
    eq: [
      { frequency: 80, gain: 2, q: 0.9, type: 'lowShelf' },
      { frequency: 300, gain: -1.5, q: 1.5, type: 'peak' },
      { frequency: 800, gain: 1, q: 1.0, type: 'peak' },
      { frequency: 3500, gain: 2.5, q: 1.2, type: 'peak' },
      { frequency: 8000, gain: 1.5, q: 0.8, type: 'highShelf' },
    ],
    compression: { threshold: -16, ratio: 3.5, attack: 20, release: 120 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 120, threshold: -18, ratio: 2.5, attack: 25, release: 150, knee: 5, makeupGain: 1.5 },
      { lowFreq: 120, highFreq: 500, threshold: -16, ratio: 2, attack: 20, release: 120, knee: 4, makeupGain: 0.5 },
      { lowFreq: 500, highFreq: 2000, threshold: -14, ratio: 2.5, attack: 15, release: 100, knee: 4, makeupGain: 0 },
      { lowFreq: 2000, highFreq: 6000, threshold: -15, ratio: 3, attack: 10, release: 80, knee: 3, makeupGain: 1 },
      { lowFreq: 6000, highFreq: 20000, threshold: -20, ratio: 2, attack: 5, release: 60, knee: 3, makeupGain: 0 },
    ],
    stereoWidth: 1.2,
    limiterCeiling: -0.5,
    characteristics: ['powerful', 'dynamic', 'aggressive', 'punchy'],
  },
  'jazz': {
    name: 'jazz',
    description: 'Natural, dynamic, warm',
    targetLUFS: -16,
    truePeak: -1.0,
    eq: [
      { frequency: 100, gain: 0.5, q: 0.7, type: 'lowShelf' },
      { frequency: 250, gain: -0.5, q: 1.0, type: 'peak' },
      { frequency: 2000, gain: 0.5, q: 1.0, type: 'peak' },
      { frequency: 6000, gain: 1, q: 0.8, type: 'peak' },
      { frequency: 12000, gain: -1, q: 0.7, type: 'highShelf' },
    ],
    compression: { threshold: -24, ratio: 1.5, attack: 30, release: 200 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 150, threshold: -22, ratio: 1.5, attack: 30, release: 200, knee: 8, makeupGain: 0.5 },
      { lowFreq: 150, highFreq: 600, threshold: -20, ratio: 1.5, attack: 25, release: 180, knee: 6, makeupGain: 0 },
      { lowFreq: 600, highFreq: 2500, threshold: -18, ratio: 1.5, attack: 20, release: 150, knee: 6, makeupGain: 0 },
      { lowFreq: 2500, highFreq: 8000, threshold: -20, ratio: 1.5, attack: 15, release: 120, knee: 5, makeupGain: 0 },
      { lowFreq: 8000, highFreq: 20000, threshold: -24, ratio: 1.3, attack: 10, release: 100, knee: 5, makeupGain: -0.5 },
    ],
    stereoWidth: 1.0,
    limiterCeiling: -1.0,
    characteristics: ['natural', 'warm', 'dynamic', 'organic'],
  },
  'classical': {
    name: 'classical',
    description: 'Maximum dynamics, transparency, natural',
    targetLUFS: -20,
    truePeak: -1.0,
    eq: [
      { frequency: 80, gain: 0, q: 0.7, type: 'lowShelf' },
      { frequency: 300, gain: -0.5, q: 1.0, type: 'peak' },
      { frequency: 3000, gain: 0.5, q: 0.8, type: 'peak' },
      { frequency: 10000, gain: 0.5, q: 0.7, type: 'highShelf' },
    ],
    compression: { threshold: -30, ratio: 1.2, attack: 50, release: 300 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 200, threshold: -28, ratio: 1.2, attack: 40, release: 250, knee: 10, makeupGain: 0 },
      { lowFreq: 200, highFreq: 800, threshold: -26, ratio: 1.2, attack: 35, release: 220, knee: 8, makeupGain: 0 },
      { lowFreq: 800, highFreq: 3000, threshold: -24, ratio: 1.2, attack: 30, release: 200, knee: 8, makeupGain: 0 },
      { lowFreq: 3000, highFreq: 10000, threshold: -26, ratio: 1.2, attack: 25, release: 180, knee: 6, makeupGain: 0 },
      { lowFreq: 10000, highFreq: 20000, threshold: -28, ratio: 1.1, attack: 20, release: 150, knee: 6, makeupGain: 0 },
    ],
    stereoWidth: 1.0,
    limiterCeiling: -1.0,
    characteristics: ['transparent', 'dynamic', 'natural', 'spacious'],
  },
  'r&b': {
    name: 'r&b',
    description: 'Warm, smooth, vocal-forward with deep bass',
    targetLUFS: -10,
    truePeak: -0.3,
    eq: [
      { frequency: 50, gain: 2.5, q: 0.8, type: 'lowShelf' },
      { frequency: 150, gain: 1, q: 1.0, type: 'peak' },
      { frequency: 400, gain: -1.5, q: 1.2, type: 'peak' },
      { frequency: 2500, gain: 1.5, q: 1.0, type: 'peak' },
      { frequency: 8000, gain: 2, q: 0.7, type: 'highShelf' },
    ],
    compression: { threshold: -14, ratio: 3, attack: 15, release: 100 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 100, threshold: -16, ratio: 3, attack: 20, release: 140, knee: 5, makeupGain: 2 },
      { lowFreq: 100, highFreq: 500, threshold: -14, ratio: 2.5, attack: 15, release: 100, knee: 4, makeupGain: 1 },
      { lowFreq: 500, highFreq: 2000, threshold: -12, ratio: 2, attack: 10, release: 80, knee: 4, makeupGain: 0 },
      { lowFreq: 2000, highFreq: 8000, threshold: -15, ratio: 2.5, attack: 8, release: 60, knee: 3, makeupGain: 1 },
      { lowFreq: 8000, highFreq: 20000, threshold: -18, ratio: 2, attack: 5, release: 50, knee: 3, makeupGain: 0.5 },
    ],
    stereoWidth: 1.15,
    limiterCeiling: -0.3,
    characteristics: ['warm', 'smooth', 'deep bass', 'silky'],
  },
  'metal': {
    name: 'metal',
    description: 'Aggressive, tight, powerful',
    targetLUFS: -9,
    truePeak: -0.3,
    eq: [
      { frequency: 60, gain: 2, q: 0.9, type: 'lowShelf' },
      { frequency: 200, gain: -2, q: 1.5, type: 'peak' },
      { frequency: 500, gain: -1, q: 1.0, type: 'peak' },
      { frequency: 2500, gain: 3, q: 1.2, type: 'peak' },
      { frequency: 5000, gain: 2, q: 1.0, type: 'peak' },
      { frequency: 10000, gain: 1, q: 0.8, type: 'highShelf' },
    ],
    compression: { threshold: -12, ratio: 5, attack: 10, release: 80 },
    multibandSettings: [
      { lowFreq: 0, highFreq: 100, threshold: -15, ratio: 4, attack: 15, release: 100, knee: 4, makeupGain: 2 },
      { lowFreq: 100, highFreq: 400, threshold: -14, ratio: 3.5, attack: 12, release: 80, knee: 3, makeupGain: 1 },
      { lowFreq: 400, highFreq: 2000, threshold: -12, ratio: 3, attack: 8, release: 60, knee: 3, makeupGain: 0.5 },
      { lowFreq: 2000, highFreq: 6000, threshold: -13, ratio: 3.5, attack: 5, release: 50, knee: 2, makeupGain: 1.5 },
      { lowFreq: 6000, highFreq: 20000, threshold: -16, ratio: 2.5, attack: 3, release: 40, knee: 2, makeupGain: 0.5 },
    ],
    stereoWidth: 1.25,
    limiterCeiling: -0.3,
    characteristics: ['aggressive', 'tight', 'powerful', 'crushing'],
  },
};

// ============================================================================
// INTELLIGENT MASTERING ENGINE CLASS
// ============================================================================

export class IntelligentMasteringEngine {
  private sampleRate: number;
  private readonly defaultSampleRate = 44100;

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate;
  }

  /**
   * Analyze audio for mastering decisions
   */
  public analyzeForMastering(audioData: Float32Array, sampleRate?: number): MasteringAnalysis {
    const sr = sampleRate || this.sampleRate;
    
    const spectral = extractSpectralFeatures(audioData, sr);
    const dynamics = extractDynamicFeatures(audioData, sr);
    const rhythm = extractRhythmFeatures(audioData, sr);
    const timbre = extractTimbreFeatures(audioData, sr);
    
    const currentLUFS = this.calculateLUFS(audioData, sr);
    const currentPeak = this.calculatePeakDB(audioData);
    const dynamicRange = this.calculateDynamicRange(audioData, sr);
    const stereoWidth = this.calculateStereoWidth(audioData);
    const frequencyBalance = this.analyzeFrequencyBalance(audioData, sr);
    
    const issues = this.detectIssues(spectral, dynamics, currentLUFS, stereoWidth, frequencyBalance);
    const recommendations = this.generateRecommendations(issues, spectral, dynamics);

    return {
      spectral,
      dynamics,
      rhythm,
      timbre,
      currentLUFS,
      currentPeak,
      dynamicRange,
      stereoWidth,
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
   * Suggest optimal mastering settings based on audio analysis
   */
  public suggestSettings(
    audioData: Float32Array,
    genre?: MasteringGenre,
    sampleRate?: number
  ): SuggestedSettings {
    const sr = sampleRate || this.sampleRate;
    const analysis = this.analyzeForMastering(audioData, sr);
    
    const detectedGenre = genre || this.detectGenre(analysis);
    const preset = GENRE_PRESETS[detectedGenre];
    const reasoning: string[] = [];

    const optimizedEQ = this.optimizeEQForAnalysis(analysis, preset.eq);
    reasoning.push(`EQ optimized based on frequency balance: sub=${analysis.frequencyBalance.sub.toFixed(2)}, bass=${analysis.frequencyBalance.bass.toFixed(2)}`);

    const optimizedMultiband = this.optimizeMultibandForAnalysis(analysis, preset.multibandSettings);
    reasoning.push(`Multiband compression adjusted for dynamic range: ${analysis.dynamicRange.toFixed(1)} dB`);

    const stereoSettings = this.optimizeStereoSettings(analysis, preset.stereoWidth);
    reasoning.push(`Stereo width set to ${stereoSettings.width.toFixed(2)} based on current width: ${analysis.stereoWidth.toFixed(2)}`);

    const loudnessSettings = this.calculateLoudnessSettings(analysis, preset.targetLUFS, preset.truePeak);
    reasoning.push(`Targeting ${preset.targetLUFS} LUFS (current: ${analysis.currentLUFS.toFixed(1)} LUFS)`);

    const limiterSettings = this.calculateLimiterSettings(analysis, preset);
    reasoning.push(`Limiter ceiling: ${limiterSettings.ceiling} dB`);

    const config: MasteringChainConfig = {
      inputGain: this.calculateInputGain(analysis),
      eq: optimizedEQ,
      multibandCompressor: optimizedMultiband,
      stereo: stereoSettings,
      loudness: loudnessSettings,
      limiter: limiterSettings,
      outputGain: 0,
      dithering: true,
      bitDepth: 24,
    };

    const confidence = this.calculateConfidence(analysis, detectedGenre);

    return {
      genre: genre || 'auto',
      config,
      confidence,
      reasoning,
    };
  }

  /**
   * Master a track with full processing chain
   */
  public masterTrack(
    audioData: Float32Array,
    config: MasteringChainConfig,
    sampleRate?: number
  ): Float32Array {
    const sr = sampleRate || this.sampleRate;
    let processed = new Float32Array(audioData);

    processed = this.applyGain(processed, config.inputGain);

    processed = this.applyEQ(processed, config.eq, sr);

    processed = this.applyMultibandCompression(processed, config.multibandCompressor, sr);

    processed = this.applyStereoProcessing(processed, config.stereo);

    processed = this.applyLoudnessNormalization(processed, config.loudness, sr);

    processed = this.applyLimiter(processed, config.limiter, sr);

    processed = this.applyGain(processed, config.outputGain);

    if (config.dithering && config.bitDepth < 32) {
      processed = this.applyDithering(processed, config.bitDepth);
    }

    return processed;
  }

  /**
   * Match audio to a reference track
   */
  public matchReference(
    targetAudio: Float32Array,
    referenceAudio: Float32Array,
    sampleRate?: number
  ): ReferenceMatchResult {
    const sr = sampleRate || this.sampleRate;
    
    const targetAnalysis = this.analyzeForMastering(targetAudio, sr);
    const referenceAnalysis = this.analyzeForMastering(referenceAudio, sr);

    const loudnessAdjustment = referenceAnalysis.currentLUFS - targetAnalysis.currentLUFS;

    const eqCurve = this.calculateMatchingEQ(targetAnalysis, referenceAnalysis);

    const stereoAdjustment = referenceAnalysis.stereoWidth / Math.max(targetAnalysis.stereoWidth, 0.1);

    const dynamicsAdjustment = this.calculateDynamicsMatch(targetAnalysis, referenceAnalysis);

    const matchConfidence = this.calculateMatchConfidence(targetAnalysis, referenceAnalysis);

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
    const blockSize = Math.floor(0.4 * sampleRate);
    const overlap = Math.floor(0.1 * sampleRate);
    const blocks: number[] = [];

    for (let i = 0; i < audioData.length - blockSize; i += overlap) {
      const block = audioData.slice(i, i + blockSize);
      const kWeighted = this.applyKWeighting(block, sampleRate);
      const meanSquare = kWeighted.reduce((sum, val) => sum + val * val, 0) / kWeighted.length;
      if (meanSquare > 0) {
        blocks.push(meanSquare);
      }
    }

    if (blocks.length === 0) return -70;

    blocks.sort((a, b) => a - b);
    const threshold = blocks[Math.floor(blocks.length * 0.1)] * 10;
    const gatedBlocks = blocks.filter(b => b > threshold);

    if (gatedBlocks.length === 0) return -70;

    const meanPower = gatedBlocks.reduce((sum, val) => sum + val, 0) / gatedBlocks.length;
    return -0.691 + 10 * Math.log10(meanPower);
  }

  private applyKWeighting(audioData: Float32Array, sampleRate: number): Float32Array {
    const result = new Float32Array(audioData.length);
    
    const a = Math.exp(-2 * Math.PI * 38.13 / sampleRate);
    const b = Math.exp(-2 * Math.PI * 1500 / sampleRate);
    
    let y1 = 0, y2 = 0;
    for (let i = 0; i < audioData.length; i++) {
      const highShelf = audioData[i] - a * (y1 - audioData[i]);
      y1 = highShelf;
      
      const highPass = highShelf - b * (y2 - highShelf);
      y2 = highPass;
      
      result[i] = highPass;
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

  private calculateDynamicRange(audioData: Float32Array, sampleRate: number): number {
    const windowSize = Math.floor(0.05 * sampleRate);
    const rmsValues: number[] = [];

    for (let i = 0; i < audioData.length - windowSize; i += windowSize / 2) {
      const window = audioData.slice(i, i + windowSize);
      let sumSquares = 0;
      for (let j = 0; j < window.length; j++) {
        sumSquares += window[j] * window[j];
      }
      const rms = Math.sqrt(sumSquares / window.length);
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

    return sideEnergy / totalEnergy;
  }

  private analyzeFrequencyBalance(
    audioData: Float32Array,
    sampleRate: number
  ): MasteringAnalysis['frequencyBalance'] {
    const fftSize = 4096;
    const numBins = fftSize / 2;
    const binWidth = sampleRate / fftSize;

    const spectrum = this.computeSpectrum(audioData.slice(0, fftSize));

    const bandEnergies = { sub: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0 };
    const bands = [
      { name: 'sub' as const, low: 20, high: 60 },
      { name: 'bass' as const, low: 60, high: 250 },
      { name: 'lowMid' as const, low: 250, high: 500 },
      { name: 'mid' as const, low: 500, high: 2000 },
      { name: 'highMid' as const, low: 2000, high: 4000 },
      { name: 'presence' as const, low: 4000, high: 8000 },
      { name: 'brilliance' as const, low: 8000, high: 20000 },
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
      sub: bandEnergies.sub / total,
      bass: bandEnergies.bass / total,
      lowMid: bandEnergies.lowMid / total,
      mid: bandEnergies.mid / total,
      highMid: bandEnergies.highMid / total,
      presence: bandEnergies.presence / total,
      brilliance: bandEnergies.brilliance / total,
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
    spectral: SpectralFeatures,
    dynamics: DynamicFeatures,
    currentLUFS: number,
    stereoWidth: number,
    frequencyBalance: MasteringAnalysis['frequencyBalance']
  ): MasteringIssue[] {
    const issues: MasteringIssue[] = [];

    if (frequencyBalance.bass > 0.4) {
      issues.push({
        type: 'frequency',
        severity: 'medium',
        description: 'Excessive bass energy detected',
        suggestedFix: 'Apply high-pass filter around 30-40 Hz and reduce low shelf',
      });
    }

    if (frequencyBalance.brilliance < 0.05) {
      issues.push({
        type: 'frequency',
        severity: 'low',
        description: 'Lacking high-frequency content',
        suggestedFix: 'Consider adding high shelf boost around 10-12 kHz',
      });
    }

    if (dynamics.dynamicRange > 20) {
      issues.push({
        type: 'dynamics',
        severity: 'medium',
        description: 'Very high dynamic range may cause issues on some playback systems',
        suggestedFix: 'Apply gentle compression to control dynamics',
      });
    }

    if (dynamics.dynamicRange < 4) {
      issues.push({
        type: 'dynamics',
        severity: 'high',
        description: 'Over-compressed, lacking dynamics',
        suggestedFix: 'Consider reducing compression or using parallel compression',
      });
    }

    if (stereoWidth > 0.6) {
      issues.push({
        type: 'stereo',
        severity: 'low',
        description: 'Very wide stereo image may cause mono compatibility issues',
        suggestedFix: 'Check mono compatibility and consider narrowing below 150 Hz',
      });
    }

    if (stereoWidth < 0.1) {
      issues.push({
        type: 'stereo',
        severity: 'low',
        description: 'Very narrow stereo image',
        suggestedFix: 'Consider stereo widening techniques',
      });
    }

    if (currentLUFS > -6) {
      issues.push({
        type: 'loudness',
        severity: 'high',
        description: 'Loudness exceeds streaming platform limits',
        suggestedFix: 'Reduce overall level to meet platform requirements',
      });
    }

    return issues;
  }

  private generateRecommendations(
    issues: MasteringIssue[],
    spectral: SpectralFeatures,
    dynamics: DynamicFeatures
  ): string[] {
    const recommendations: string[] = [];

    for (const issue of issues) {
      recommendations.push(issue.suggestedFix);
    }

    if (spectral.brightness < 0.3) {
      recommendations.push('Consider adding air/brightness with high shelf EQ');
    }

    if (spectral.bassPresence > 0.5) {
      recommendations.push('Bass-heavy mix: ensure proper low-end management');
    }

    if (dynamics.crestFactor > 12) {
      recommendations.push('High crest factor suggests good transient preservation');
    }

    return recommendations;
  }

  private detectGenre(analysis: MasteringAnalysis): MasteringGenre {
    const scores: Record<MasteringGenre, number> = {
      'hip-hop': 0,
      'electronic': 0,
      'pop': 0,
      'rock': 0,
      'jazz': 0,
      'classical': 0,
      'r&b': 0,
      'metal': 0,
    };

    if (analysis.frequencyBalance.sub > 0.1 && analysis.frequencyBalance.bass > 0.25) {
      scores['hip-hop'] += 3;
      scores['electronic'] += 2;
      scores['r&b'] += 2;
    }

    if (analysis.dynamicRange < 6) {
      scores['electronic'] += 2;
      scores['metal'] += 2;
      scores['hip-hop'] += 1;
    }

    if (analysis.dynamicRange > 15) {
      scores['classical'] += 3;
      scores['jazz'] += 2;
    }

    if (analysis.stereoWidth > 0.4) {
      scores['electronic'] += 2;
      scores['rock'] += 1;
    }

    if (analysis.rhythm.tempo > 115 && analysis.rhythm.tempo < 135) {
      scores['electronic'] += 2;
      scores['pop'] += 1;
    }

    if (analysis.rhythm.tempo > 80 && analysis.rhythm.tempo < 100) {
      scores['hip-hop'] += 2;
      scores['r&b'] += 2;
    }

    if (analysis.frequencyBalance.mid > 0.3 && analysis.frequencyBalance.highMid > 0.15) {
      scores['rock'] += 2;
      scores['metal'] += 1;
    }

    let maxScore = 0;
    let detectedGenre: MasteringGenre = 'pop';
    for (const [genre, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedGenre = genre as MasteringGenre;
      }
    }

    return detectedGenre;
  }

  // ============================================================================
  // PRIVATE OPTIMIZATION METHODS
  // ============================================================================

  private optimizeEQForAnalysis(analysis: MasteringAnalysis, presetEQ: EQBand[]): EQBand[] {
    const optimized = presetEQ.map(band => ({ ...band }));

    const idealBalance = {
      sub: 0.08,
      bass: 0.22,
      lowMid: 0.15,
      mid: 0.25,
      highMid: 0.15,
      presence: 0.10,
      brilliance: 0.05,
    };

    for (const band of optimized) {
      if (band.frequency < 60) {
        const diff = idealBalance.sub - analysis.frequencyBalance.sub;
        band.gain += diff * 10;
      } else if (band.frequency < 250) {
        const diff = idealBalance.bass - analysis.frequencyBalance.bass;
        band.gain += diff * 8;
      } else if (band.frequency < 500) {
        const diff = idealBalance.lowMid - analysis.frequencyBalance.lowMid;
        band.gain += diff * 6;
      } else if (band.frequency < 2000) {
        const diff = idealBalance.mid - analysis.frequencyBalance.mid;
        band.gain += diff * 5;
      } else if (band.frequency < 4000) {
        const diff = idealBalance.highMid - analysis.frequencyBalance.highMid;
        band.gain += diff * 6;
      } else if (band.frequency < 8000) {
        const diff = idealBalance.presence - analysis.frequencyBalance.presence;
        band.gain += diff * 8;
      } else {
        const diff = idealBalance.brilliance - analysis.frequencyBalance.brilliance;
        band.gain += diff * 10;
      }

      band.gain = Math.max(-12, Math.min(12, band.gain));
    }

    return optimized;
  }

  private optimizeMultibandForAnalysis(
    analysis: MasteringAnalysis,
    presetBands: MultibandCompressorBand[]
  ): MultibandCompressorBand[] {
    const optimized = presetBands.map(band => ({ ...band }));

    const dynamicFactor = analysis.dynamicRange / 10;

    for (const band of optimized) {
      if (dynamicFactor > 1.5) {
        band.threshold -= 3;
        band.ratio *= 1.2;
      } else if (dynamicFactor < 0.6) {
        band.threshold += 2;
        band.ratio *= 0.8;
      }

      band.threshold = Math.max(-30, Math.min(-6, band.threshold));
      band.ratio = Math.max(1, Math.min(10, band.ratio));
    }

    return optimized;
  }

  private optimizeStereoSettings(analysis: MasteringAnalysis, presetWidth: number): StereoSettings {
    let width = presetWidth;

    if (analysis.stereoWidth < 0.2) {
      width = Math.min(1.4, presetWidth * 1.3);
    } else if (analysis.stereoWidth > 0.5) {
      width = Math.max(0.9, presetWidth * 0.9);
    }

    return {
      width,
      bassMonoFreq: 120,
      midSideBalance: 0,
      correlation: 0.3,
    };
  }

  private calculateLoudnessSettings(
    analysis: MasteringAnalysis,
    targetLUFS: number,
    truePeak: number
  ): LoudnessSettings {
    return {
      targetLUFS,
      truePeak,
      loudnessRange: Math.min(analysis.dynamicRange, 8),
      shortTermMax: 3,
    };
  }

  private calculateLimiterSettings(
    analysis: MasteringAnalysis,
    preset: GenrePreset
  ): LimiterSettings {
    const ceilingHeadroom = analysis.dynamicRange < 6 ? 0.1 : 0;

    return {
      ceiling: preset.limiterCeiling - ceilingHeadroom,
      release: analysis.dynamicRange > 12 ? 100 : 50,
      lookahead: 1.5,
      softClip: analysis.dynamicRange < 8,
    };
  }

  private calculateInputGain(analysis: MasteringAnalysis): number {
    const targetHeadroom = -6;
    const currentHeadroom = -analysis.currentPeak;
    return targetHeadroom - currentHeadroom;
  }

  private calculateConfidence(analysis: MasteringAnalysis, genre: MasteringGenre): number {
    let confidence = 0.7;

    if (analysis.issues.length === 0) confidence += 0.1;
    if (analysis.issues.filter(i => i.severity === 'high').length === 0) confidence += 0.1;

    const preset = GENRE_PRESETS[genre];
    const tempoMatch = Math.abs(analysis.rhythm.tempo - (preset.name === 'hip-hop' ? 90 : 120)) < 20;
    if (tempoMatch) confidence += 0.05;

    return Math.min(confidence, 0.95);
  }

  private calculateMatchingEQ(
    target: MasteringAnalysis,
    reference: MasteringAnalysis
  ): EQBand[] {
    const eqCurve: EQBand[] = [];

    const bands = [
      { freq: 40, key: 'sub' as const },
      { freq: 120, key: 'bass' as const },
      { freq: 350, key: 'lowMid' as const },
      { freq: 1000, key: 'mid' as const },
      { freq: 3000, key: 'highMid' as const },
      { freq: 6000, key: 'presence' as const },
      { freq: 12000, key: 'brilliance' as const },
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
          type: band.freq < 100 ? 'lowShelf' : band.freq > 8000 ? 'highShelf' : 'peak',
        });
      }
    }

    return eqCurve;
  }

  private calculateDynamicsMatch(
    target: MasteringAnalysis,
    reference: MasteringAnalysis
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
    reference: MasteringAnalysis
  ): number {
    let similarity = 0;

    const lufsDiff = Math.abs(target.currentLUFS - reference.currentLUFS);
    similarity += Math.max(0, 1 - lufsDiff / 20) * 0.3;

    const dynamicDiff = Math.abs(target.dynamicRange - reference.dynamicRange);
    similarity += Math.max(0, 1 - dynamicDiff / 15) * 0.3;

    const widthDiff = Math.abs(target.stereoWidth - reference.stereoWidth);
    similarity += Math.max(0, 1 - widthDiff / 0.5) * 0.2;

    let freqSimilarity = 0;
    const keys: (keyof MasteringAnalysis['frequencyBalance'])[] = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance'];
    for (const key of keys) {
      const diff = Math.abs(target.frequencyBalance[key] - reference.frequencyBalance[key]);
      freqSimilarity += Math.max(0, 1 - diff / 0.3);
    }
    similarity += (freqSimilarity / keys.length) * 0.2;

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

  private applyEQ(audioData: Float32Array, bands: EQBand[], sampleRate: number): Float32Array {
    let result = new Float32Array(audioData);

    for (const band of bands) {
      result = this.applyBiquadFilter(result, band, sampleRate);
    }

    return result;
  }

  private applyBiquadFilter(
    audioData: Float32Array,
    band: EQBand,
    sampleRate: number
  ): Float32Array {
    const result = new Float32Array(audioData.length);
    const omega = 2 * Math.PI * band.frequency / sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * band.q);
    const A = Math.pow(10, band.gain / 40);

    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

    switch (band.type) {
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cosOmega;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha / A;
        break;
      case 'lowShelf':
        const sqrtA = Math.sqrt(A);
        b0 = A * ((A + 1) - (A - 1) * cosOmega + 2 * sqrtA * alpha);
        b1 = 2 * A * ((A - 1) - (A + 1) * cosOmega);
        b2 = A * ((A + 1) - (A - 1) * cosOmega - 2 * sqrtA * alpha);
        a0 = (A + 1) + (A - 1) * cosOmega + 2 * sqrtA * alpha;
        a1 = -2 * ((A - 1) + (A + 1) * cosOmega);
        a2 = (A + 1) + (A - 1) * cosOmega - 2 * sqrtA * alpha;
        break;
      case 'highShelf':
        const sqrtAh = Math.sqrt(A);
        b0 = A * ((A + 1) + (A - 1) * cosOmega + 2 * sqrtAh * alpha);
        b1 = -2 * A * ((A - 1) + (A + 1) * cosOmega);
        b2 = A * ((A + 1) + (A - 1) * cosOmega - 2 * sqrtAh * alpha);
        a0 = (A + 1) - (A - 1) * cosOmega + 2 * sqrtAh * alpha;
        a1 = 2 * ((A - 1) - (A + 1) * cosOmega);
        a2 = (A + 1) - (A - 1) * cosOmega - 2 * sqrtAh * alpha;
        break;
      case 'lowPass':
        b0 = (1 - cosOmega) / 2;
        b1 = 1 - cosOmega;
        b2 = (1 - cosOmega) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosOmega;
        a2 = 1 - alpha;
        break;
      case 'highPass':
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

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
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
    sampleRate: number
  ): Float32Array {
    const result = new Float32Array(audioData.length);

    const bandSignals: Float32Array[] = [];
    for (const band of bands) {
      const filtered = this.isolateBand(audioData, band.lowFreq, band.highFreq, sampleRate);
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
    sampleRate: number
  ): Float32Array {
    let result = new Float32Array(audioData);

    if (lowFreq > 20) {
      result = this.applyBiquadFilter(result, {
        frequency: lowFreq,
        gain: 0,
        q: 0.707,
        type: 'highPass',
      }, sampleRate);
    }

    if (highFreq < 20000) {
      result = this.applyBiquadFilter(result, {
        frequency: highFreq,
        gain: 0,
        q: 0.707,
        type: 'lowPass',
      }, sampleRate);
    }

    return result;
  }

  private compressBand(audioData: Float32Array, band: MultibandCompressorBand): Float32Array {
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
          const kneeRatio = 1 + (band.ratio - 1) * (overThreshold - 1) / (kneeLinear - 1);
          gain = 1 / Math.pow(overThreshold, 1 - 1 / kneeRatio);
        } else {
          gain = 1 / Math.pow(overThreshold, 1 - 1 / band.ratio);
        }
      }

      result[i] = audioData[i] * gain * makeupLinear;
    }

    return result;
  }

  private applyStereoProcessing(audioData: Float32Array, settings: StereoSettings): Float32Array {
    const result = new Float32Array(audioData.length);

    for (let i = 0; i < audioData.length - 1; i += 2) {
      const left = audioData[i];
      const right = audioData[i + 1];
      
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
    sampleRate: number
  ): Float32Array {
    const currentLUFS = this.calculateLUFS(audioData, sampleRate);
    const gainNeeded = settings.targetLUFS - currentLUFS;
    
    const gainLimited = Math.min(gainNeeded, 12);
    
    return this.applyGain(audioData, gainLimited);
  }

  private applyLimiter(
    audioData: Float32Array,
    settings: LimiterSettings,
    sampleRate: number
  ): Float32Array {
    const result = new Float32Array(audioData.length);
    const ceilingLinear = Math.pow(10, settings.ceiling / 20);
    const releaseCoef = Math.exp(-1 / (settings.release * 0.001 * sampleRate));
    const lookaheadSamples = Math.floor(settings.lookahead * 0.001 * sampleRate);
    
    let gainReduction = 1;

    for (let i = 0; i < audioData.length; i++) {
      let peakAhead = Math.abs(audioData[i]);
      for (let j = 1; j < lookaheadSamples && i + j < audioData.length; j++) {
        peakAhead = Math.max(peakAhead, Math.abs(audioData[i + j]));
      }

      const targetGain = peakAhead > ceilingLinear ? ceilingLinear / peakAhead : 1;
      
      if (targetGain < gainReduction) {
        gainReduction = targetGain;
      } else {
        gainReduction = releaseCoef * gainReduction + (1 - releaseCoef) * targetGain;
      }

      let sample = audioData[i] * gainReduction;

      if (settings.softClip && Math.abs(sample) > ceilingLinear * 0.9) {
        const threshold = ceilingLinear * 0.9;
        if (sample > threshold) {
          sample = threshold + (1 - Math.exp(-(sample - threshold) / (ceilingLinear - threshold))) * (ceilingLinear - threshold);
        } else if (sample < -threshold) {
          sample = -threshold - (1 - Math.exp(-(-sample - threshold) / (ceilingLinear - threshold))) * (ceilingLinear - threshold);
        }
      }

      result[i] = Math.max(-ceilingLinear, Math.min(ceilingLinear, sample));
    }

    return result;
  }

  private applyDithering(audioData: Float32Array, bitDepth: number): Float32Array {
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
