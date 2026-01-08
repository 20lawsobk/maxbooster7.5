import { logger } from '../logger.js';

export interface LUFSAnalysis {
  integratedLoudness: number;
  loudnessRange: number;
  truePeak: number;
  shortTermMax: number;
  momentaryMax: number;
  samplePeakLeft: number;
  samplePeakRight: number;
}

export interface NormalizationResult {
  originalLUFS: number;
  targetLUFS: number;
  gainAdjustment: number;
  truePeakBefore: number;
  truePeakAfter: number;
  clippingPrevented: boolean;
  normalizationApplied: boolean;
}

export const LOUDNESS_TARGETS = {
  STREAMING: {
    spotify: -14,
    appleMusic: -16,
    youtube: -14,
    tidal: -14,
    amazon: -14,
    deezer: -15,
  },
  BROADCAST: {
    ebuR128: -23,
    atscA85: -24,
    arib: -24,
    op59: -23,
  },
  MASTERING: {
    cd: -9,
    vinyl: -12,
    reference: -14,
  },
} as const;

export type StreamingPlatform = keyof typeof LOUDNESS_TARGETS.STREAMING;
export type BroadcastStandard = keyof typeof LOUDNESS_TARGETS.BROADCAST;

export class AudioNormalizationService {
  private static instance: AudioNormalizationService;

  static getInstance(): AudioNormalizationService {
    if (!AudioNormalizationService.instance) {
      AudioNormalizationService.instance = new AudioNormalizationService();
    }
    return AudioNormalizationService.instance;
  }

  analyzeLUFS(samples: Float32Array, sampleRate: number, channels: number = 2): LUFSAnalysis {
    const blockSize = Math.floor(sampleRate * 0.4);
    const hopSize = Math.floor(sampleRate * 0.1);
    const samplesPerChannel = Math.floor(samples.length / channels);

    const leftChannel = new Float32Array(samplesPerChannel);
    const rightChannel = new Float32Array(samplesPerChannel);

    for (let i = 0; i < samplesPerChannel; i++) {
      leftChannel[i] = samples[i * channels];
      rightChannel[i] = channels > 1 ? samples[i * channels + 1] : samples[i * channels];
    }

    const leftFiltered = this.applyKWeighting(leftChannel, sampleRate);
    const rightFiltered = this.applyKWeighting(rightChannel, sampleRate);

    const momentaryLoudness: number[] = [];
    const shortTermLoudness: number[] = [];

    for (let i = 0; i + blockSize <= samplesPerChannel; i += hopSize) {
      const leftBlock = leftFiltered.slice(i, i + blockSize);
      const rightBlock = rightFiltered.slice(i, i + blockSize);

      const leftMean = this.meanSquare(leftBlock);
      const rightMean = this.meanSquare(rightBlock);

      const blockLoudness = -0.691 + 10 * Math.log10(leftMean + rightMean);
      momentaryLoudness.push(blockLoudness);
    }

    const shortTermBlockSize = Math.floor(sampleRate * 3);
    const shortTermHopSize = Math.floor(sampleRate);

    for (let i = 0; i + shortTermBlockSize <= samplesPerChannel; i += shortTermHopSize) {
      const leftBlock = leftFiltered.slice(i, i + shortTermBlockSize);
      const rightBlock = rightFiltered.slice(i, i + shortTermBlockSize);

      const leftMean = this.meanSquare(leftBlock);
      const rightMean = this.meanSquare(rightBlock);

      const blockLoudness = -0.691 + 10 * Math.log10(leftMean + rightMean);
      shortTermLoudness.push(blockLoudness);
    }

    const gatedBlocks = this.gatingPass(momentaryLoudness, -70);
    const relativeThreshold = this.calculateMean(gatedBlocks) - 10;
    const finalBlocks = gatedBlocks.filter(l => l > relativeThreshold);
    const integratedLoudness = finalBlocks.length > 0
      ? this.calculateMean(finalBlocks)
      : -70;

    const loudnessRange = this.calculateLoudnessRange(shortTermLoudness);

    const truePeakLeft = this.calculateTruePeak(leftChannel, sampleRate);
    const truePeakRight = this.calculateTruePeak(rightChannel, sampleRate);
    const truePeak = Math.max(truePeakLeft, truePeakRight);

    const samplePeakLeft = this.calculateSamplePeak(leftChannel);
    const samplePeakRight = this.calculateSamplePeak(rightChannel);

    return {
      integratedLoudness,
      loudnessRange,
      truePeak: 20 * Math.log10(truePeak),
      shortTermMax: shortTermLoudness.length > 0 ? Math.max(...shortTermLoudness) : -70,
      momentaryMax: momentaryLoudness.length > 0 ? Math.max(...momentaryLoudness) : -70,
      samplePeakLeft: 20 * Math.log10(samplePeakLeft),
      samplePeakRight: 20 * Math.log10(samplePeakRight),
    };
  }

  normalizeToTarget(
    samples: Float32Array,
    sampleRate: number,
    channels: number,
    targetLUFS: number,
    preventClipping: boolean = true
  ): { samples: Float32Array; result: NormalizationResult } {
    const analysis = this.analyzeLUFS(samples, sampleRate, channels);
    const gainDb = targetLUFS - analysis.integratedLoudness;
    let gainLinear = Math.pow(10, gainDb / 20);

    const maxPeakAfter = analysis.truePeak + gainDb;
    let clippingPrevented = false;

    if (preventClipping && maxPeakAfter > -1) {
      const headroom = -1 - analysis.integratedLoudness;
      const maxGainDb = headroom + analysis.integratedLoudness;
      gainLinear = Math.pow(10, (targetLUFS - analysis.integratedLoudness - (maxPeakAfter + 1)) / 20);
      clippingPrevented = true;
      logger.info('Clipping prevention applied', {
        originalGain: gainDb,
        adjustedGain: 20 * Math.log10(gainLinear),
      });
    }

    const normalizedSamples = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      normalizedSamples[i] = samples[i] * gainLinear;
    }

    const normalizedAnalysis = this.analyzeLUFS(normalizedSamples, sampleRate, channels);

    return {
      samples: normalizedSamples,
      result: {
        originalLUFS: analysis.integratedLoudness,
        targetLUFS,
        gainAdjustment: 20 * Math.log10(gainLinear),
        truePeakBefore: analysis.truePeak,
        truePeakAfter: normalizedAnalysis.truePeak,
        clippingPrevented,
        normalizationApplied: Math.abs(gainDb) > 0.1,
      },
    };
  }

  getStreamingTarget(platform: StreamingPlatform): number {
    return LOUDNESS_TARGETS.STREAMING[platform];
  }

  getBroadcastTarget(standard: BroadcastStandard): number {
    return LOUDNESS_TARGETS.BROADCAST[standard];
  }

  isCompliant(analysis: LUFSAnalysis, targetLUFS: number, tolerance: number = 1): boolean {
    return Math.abs(analysis.integratedLoudness - targetLUFS) <= tolerance;
  }

  private applyKWeighting(samples: Float32Array, sampleRate: number): Float32Array {
    const result = new Float32Array(samples.length);
    const fc = 1500;
    const Q = 0.707;
    const K = Math.tan(Math.PI * fc / sampleRate);
    const norm = 1 / (1 + K / Q + K * K);
    const a0 = K * K * norm;
    const a1 = 2 * a0;
    const a2 = a0;
    const b1 = 2 * (K * K - 1) * norm;
    const b2 = (1 - K / Q + K * K) * norm;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const y = a0 * x + a1 * x1 + a2 * x2 - b1 * y1 - b2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      result[i] = y;
    }

    return result;
  }

  private meanSquare(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return sum / samples.length;
  }

  private gatingPass(loudnessValues: number[], threshold: number): number[] {
    return loudnessValues.filter(l => l > threshold);
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return -70;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateLoudnessRange(shortTermValues: number[]): number {
    if (shortTermValues.length < 2) return 0;

    const sorted = [...shortTermValues].sort((a, b) => a - b);
    const gated = sorted.filter(v => v > sorted[Math.floor(sorted.length * 0.1)]);

    if (gated.length < 2) return 0;

    const low = gated[Math.floor(gated.length * 0.1)];
    const high = gated[Math.floor(gated.length * 0.95)];

    return high - low;
  }

  private calculateTruePeak(samples: Float32Array, sampleRate: number): number {
    const oversamplingFactor = 4;
    let maxPeak = 0;

    for (let i = 0; i < samples.length - 1; i++) {
      const sample = Math.abs(samples[i]);
      if (sample > maxPeak) maxPeak = sample;

      for (let j = 1; j < oversamplingFactor; j++) {
        const t = j / oversamplingFactor;
        const interpolated = Math.abs(samples[i] * (1 - t) + samples[i + 1] * t);
        if (interpolated > maxPeak) maxPeak = interpolated;
      }
    }

    return maxPeak || 0.0001;
  }

  private calculateSamplePeak(samples: Float32Array): number {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }
    return max || 0.0001;
  }
}

export const audioNormalizationService = AudioNormalizationService.getInstance();
