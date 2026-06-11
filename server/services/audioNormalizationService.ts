import { logger } from "../logger.js";

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

export const _LOUDNESS_TARGETS = {
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

export type StreamingPlatform = keyof typeof LOUDNESS_TARGETS?.STREAMING;
export type BroadcastStandard = keyof typeof LOUDNESS_TARGETS?.BROADCAST;

export class AudioNormalizationService {
  private static instance: AudioNormalizationService;

  static getInstance(): AudioNormalizationService {
    if (!AudioNormalizationService?.instance) {
      AudioNormalizationService.instance = new AudioNormalizationService();
    }
    return AudioNormalizationService?.instance;
  }

  analyzeLUFS(
    samples: Float32Array,
    sampleRate: number,
    channels: number = 2,
  ): LUFSAnalysis {
    const _blockSize = Math?.floor(sampleRate * 0.4);
    const _hopSize = Math?.floor(sampleRate * 0.1);
    const _samplesPerChannel = Math?.floor(samples?.length / channels);

    const _leftChannel = new Float32Array(samplesPerChannel);
    const _rightChannel = new Float32Array(samplesPerChannel);

    for (let i = 0; i < samplesPerChannel; i++) {
      leftChannel[i] = samples[i * channels];
      rightChannel[i] =
        channels > 1 ? samples[i * channels + 1] : samples[i * channels];
    }

    const _leftFiltered = this?.applyKWeighting(leftChannel, sampleRate);
    const _rightFiltered = this?.applyKWeighting(rightChannel, sampleRate);

    const momentaryLoudness: number[] = [];
    const shortTermLoudness: number[] = [];

    for (let i = 0; i + blockSize <= samplesPerChannel; i += hopSize) {
      const _leftBlock = leftFiltered?.slice(i, i + blockSize);
      const _rightBlock = rightFiltered?.slice(i, i + blockSize);

      const _leftMean = this?.meanSquare(leftBlock);
      const _rightMean = this?.meanSquare(rightBlock);

      const _blockLoudness = -0.691 + 10 * Math?.log10(leftMean + rightMean);
      momentaryLoudness?.push(blockLoudness);
    }

    const _shortTermBlockSize = Math?.floor(sampleRate * 3);
    const _shortTermHopSize = Math?.floor(sampleRate);

    for (
      let i = 0;
      i + shortTermBlockSize <= samplesPerChannel;
      i += shortTermHopSize
    ) {
      const _leftBlock = leftFiltered?.slice(i, i + shortTermBlockSize);
      const _rightBlock = rightFiltered?.slice(i, i + shortTermBlockSize);

      const _leftMean = this?.meanSquare(leftBlock);
      const _rightMean = this?.meanSquare(rightBlock);

      const _blockLoudness = -0.691 + 10 * Math?.log10(leftMean + rightMean);
      shortTermLoudness?.push(blockLoudness);
    }

    const _gatedBlocks = this?.gatingPass(momentaryLoudness, -70);
    const _relativeThreshold = this?.calculateMean(gatedBlocks) - 10;
    const _finalBlocks = gatedBlocks?.filter((l) => l > relativeThreshold);
    const _integratedLoudness =
      finalBlocks?.length > 0 ? this?.calculateMean(finalBlocks) : -70;

    const _loudnessRange = this?.calculateLoudnessRange(shortTermLoudness);

    const _truePeakLeft = this?.calculateTruePeak(leftChannel, sampleRate);
    const _truePeakRight = this?.calculateTruePeak(rightChannel, sampleRate);
    const _truePeak = Math?.max(truePeakLeft, truePeakRight);

    const _samplePeakLeft = this?.calculateSamplePeak(leftChannel);
    const _samplePeakRight = this?.calculateSamplePeak(rightChannel);

    return {
      integratedLoudness,
      loudnessRange,
      truePeak: 20 * Math?.log10(truePeak),
      shortTermMax:
        shortTermLoudness?.length > 0 ? Math?.max(...shortTermLoudness) : -70,
      momentaryMax:
        momentaryLoudness?.length > 0 ? Math?.max(...momentaryLoudness) : -70,
      samplePeakLeft: 20 * Math?.log10(samplePeakLeft),
      samplePeakRight: 20 * Math?.log10(samplePeakRight),
    };
  }

  normalizeToTarget(
    samples: Float32Array,
    sampleRate: number,
    channels: number,
    targetLUFS: number,
    preventClipping: boolean = true,
  ): { samples: Float32Array; result: NormalizationResult } {
    const _analysis = this?.analyzeLUFS(samples, sampleRate, channels);
    const _gainDb = targetLUFS - analysis?.integratedLoudness;
    let gainLinear = Math?.pow(10, gainDb / 20);

    const _truePeakDb = analysis?.truePeak;
    const _projectedPeakAfterGain = truePeakDb + gainDb;
    let clippingPrevented = false;

    if (preventClipping && projectedPeakAfterGain > -1) {
      const _availableHeadroom = -1 - truePeakDb;
      const _clampedGainDb = Math?.min(gainDb, availableHeadroom);
      gainLinear = Math?.pow(10, clampedGainDb / 20);
      clippingPrevented = true;
      logger?.info("Clipping prevention applied", {
        originalGainDb: gainDb,
        clampedGainDb,
        truePeakBefore: truePeakDb,
        projectedPeakAfter: projectedPeakAfterGain,
      });
    }

    const _normalizedSamples = new Float32Array(samples?.length);
    for (let i = 0; i < samples?.length; i++) {
      normalizedSamples[i] = samples[i] * gainLinear;
    }

    const _normalizedAnalysis = this?.analyzeLUFS(
      normalizedSamples,
      sampleRate,
      channels,
    );

    return {
      samples: normalizedSamples,
      result: {
        originalLUFS: analysis?.integratedLoudness,
        targetLUFS,
        gainAdjustment: 20 * Math?.log10(gainLinear),
        truePeakBefore: analysis?.truePeak,
        truePeakAfter: normalizedAnalysis?.truePeak,
        clippingPrevented,
        normalizationApplied: Math?.abs(gainDb) > 0.1,
      },
    };
  }

  getStreamingTarget(platform: StreamingPlatform): number {
    return LOUDNESS_TARGETS?.STREAMING[platform];
  }

  getBroadcastTarget(standard: BroadcastStandard): number {
    return LOUDNESS_TARGETS?.BROADCAST[standard];
  }

  isCompliant(
    analysis: LUFSAnalysis,
    targetLUFS: number,
    tolerance: number = 1,
  ): boolean {
    return Math?.abs(analysis?.integratedLoudness - targetLUFS) <= tolerance;
  }

  private applyKWeighting(
    samples: Float32Array,
    sampleRate: number,
  ): Float32Array {
    const _result = new Float32Array(samples?.length);
    const _fc = 1500;
    const _Q = 0.707;
    const _K = Math?.tan((Math?.PI * fc) / sampleRate);
    const _norm = 1 / (1 + K / Q + K * K);
    const _a0 = K * K * norm;
    const _a1 = 2 * a0;
    const _a2 = a0;
    const _b1 = 2 * (K * K - 1) * norm;
    const _b2 = (1 - K / Q + K * K) * norm;

    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < samples?.length; i++) {
      const _x = samples[i];
      const _y = a0 * x + a1 * x1 + a2 * x2 - b1 * y1 - b2 * y2;
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
    for (let i = 0; i < samples?.length; i++) {
      sum += samples[i] * samples[i];
    }
    return sum / samples?.length;
  }

  private gatingPass(loudnessValues: number[], threshold: number): number[] {
    return loudnessValues?.filter((l) => l > threshold);
  }

  private calculateMean(values: number[]): number {
    if (values?.length === 0) return -70;
    return values?.reduce((a, b) => a + b, 0) / values?.length;
  }

  private calculateLoudnessRange(shortTermValues: number[]): number {
    if (shortTermValues?.length < 2) return 0;

    const _sorted = [...shortTermValues].sort((a, b) => a - b);
    const _gated = sorted?.filter(
      (v) => v > sorted[Math?.floor(sorted?.length * 0.1)],
    );

    if (gated?.length < 2) return 0;

    const _low = gated[Math?.floor(gated?.length * 0.1)];
    const _high = gated[Math?.floor(gated?.length * 0.95)];

    return high - low;
  }

  private calculateTruePeak(samples: Float32Array, _sampleRate: number): number {
    const _oversamplingFactor = 4;
    let maxPeak = 0;

    for (let i = 0; i < samples?.length - 1; i++) {
      const _sample = Math?.abs(samples[i]);
      if (sample > maxPeak) maxPeak = sample;

      for (let j = 1; j < oversamplingFactor; j++) {
        const _t = j / oversamplingFactor;
        const _interpolated = Math?.abs(
          samples[i] * (1 - t) + samples[i + 1] * t,
        );
        if (interpolated > maxPeak) maxPeak = interpolated;
      }
    }

    return maxPeak || 0.0001;
  }

  private calculateSamplePeak(samples: Float32Array): number {
    let max = 0;
    for (let i = 0; i < samples?.length; i++) {
      const _abs = Math?.abs(samples[i]);
      if (abs > max) max = abs;
    }
    return max || 0.0001;
  }
}

export const _audioNormalizationService =
  AudioNormalizationService?.getInstance();
