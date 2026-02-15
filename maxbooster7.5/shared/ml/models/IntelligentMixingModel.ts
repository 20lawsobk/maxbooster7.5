/**
 * Custom Intelligent Mixing & Mastering AI
 * Parameter optimization for professional audio processing
 * LUFS targeting, dynamic range optimization, frequency balancing
 */

export interface MixingParameters {
  gainDB: number;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  eqBands: Array<{ freq: number; gain: number; q: number }>;
  reverbMix: number;
  stereoWidth: number;
}

export interface MasteringParameters {
  targetLUFS: number;
  limiterThreshold: number;
  limiterRelease: number;
  stereoEnhancement: number;
  highShelfGain: number;
  lowShelfGain: number;
}

export interface AudioAnalysis {
  peakLevel: number;
  rmsLevel: number;
  dynamicRange: number;
  spectralBalance: { low: number; mid: number; high: number };
  stereoWidth: number;
  estimatedLUFS: number;
}

export class IntelligentMixingModel {
  private readonly targetLUFS = -14;
  private readonly targetDynamicRange = 8;

  constructor() {}

  public analyzeAudio(audioBuffer: Float32Array): AudioAnalysis {
    const peakLevel = this.calculatePeak(audioBuffer);
    const rmsLevel = this.calculateRMS(audioBuffer);
    const dynamicRange = this.calculateDynamicRange(audioBuffer);
    const spectralBalance = this.analyzeSpectralBalance(audioBuffer);
    const stereoWidth = this.calculateStereoWidth(audioBuffer);
    const estimatedLUFS = this.estimateLUFS(rmsLevel);

    return {
      peakLevel,
      rmsLevel,
      dynamicRange,
      spectralBalance,
      stereoWidth,
      estimatedLUFS,
    };
  }

  public optimizeMixing(analysis: AudioAnalysis, targetGenre?: string): MixingParameters {
    const gainAdjustment = this.calculateOptimalGain(analysis);
    
    const compressorParams = this.optimizeCompression(analysis, targetGenre);
    
    const eqBands = this.optimizeEQ(analysis, targetGenre);
    
    const reverbMix = this.calculateReverbMix(targetGenre);
    
    const stereoWidth = this.optimizeStereoWidth(analysis);

    return {
      gainDB: gainAdjustment,
      compressorThreshold: compressorParams.threshold,
      compressorRatio: compressorParams.ratio,
      compressorAttack: compressorParams.attack,
      compressorRelease: compressorParams.release,
      eqBands,
      reverbMix,
      stereoWidth,
    };
  }

  public optimizeMastering(analysis: AudioAnalysis): MasteringParameters {
    const currentLUFS = analysis.estimatedLUFS;
    const targetLUFS = this.targetLUFS;

    const lufsAdjustment = targetLUFS - currentLUFS;

    const limiterThreshold = Math.max(-1, -0.3 + lufsAdjustment * 0.1);
    const limiterRelease = this.calculateLimiterRelease(analysis.dynamicRange);

    const stereoEnhancement = analysis.stereoWidth < 0.5 ? 1.2 : 1.0;

    const highShelfGain = this.optimizeHighShelf(analysis);
    const lowShelfGain = this.optimizeLowShelf(analysis);

    return {
      targetLUFS,
      limiterThreshold,
      limiterRelease,
      stereoEnhancement,
      highShelfGain,
      lowShelfGain,
    };
  }

  private calculatePeak(buffer: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      peak = Math.max(peak, Math.abs(buffer[i]));
    }
    return 20 * Math.log10(peak || 0.0001);
  }

  private calculateRMS(buffer: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    return 20 * Math.log10(rms || 0.0001);
  }

  private calculateDynamicRange(buffer: Float32Array): number {
    const windowSize = 4410;
    const rmsValues: number[] = [];

    for (let i = 0; i < buffer.length - windowSize; i += windowSize / 2) {
      const window = buffer.slice(i, i + windowSize);
      let sumSquares = 0;
      for (let j = 0; j < window.length; j++) {
        sumSquares += window[j] * window[j];
      }
      const rms = Math.sqrt(sumSquares / window.length);
      rmsValues.push(20 * Math.log10(rms || 0.0001));
    }

    rmsValues.sort((a, b) => a - b);
    const percentile95 = rmsValues[Math.floor(rmsValues.length * 0.95)];
    const percentile5 = rmsValues[Math.floor(rmsValues.length * 0.05)];

    return percentile95 - percentile5;
  }

  private analyzeSpectralBalance(buffer: Float32Array): {
    low: number;
    mid: number;
    high: number;
  } {
    const fftSize = 2048;
    const spectrum = this.calculateFFT(buffer.slice(0, fftSize));

    const lowBand = spectrum.slice(0, Math.floor(spectrum.length * 0.15));
    const midBand = spectrum.slice(
      Math.floor(spectrum.length * 0.15),
      Math.floor(spectrum.length * 0.6)
    );
    const highBand = spectrum.slice(Math.floor(spectrum.length * 0.6));

    const low = this.calculateBandEnergy(lowBand);
    const mid = this.calculateBandEnergy(midBand);
    const high = this.calculateBandEnergy(highBand);

    const total = low + mid + high;

    return {
      low: low / total,
      mid: mid / total,
      high: high / total,
    };
  }

  private calculateFFT(signal: Float32Array): Float32Array {
    const n = signal.length;
    const result = new Float32Array(n / 2);

    for (let k = 0; k < n / 2; k++) {
      let real = 0;
      let imag = 0;

      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        real += signal[t] * Math.cos(angle);
        imag -= signal[t] * Math.sin(angle);
      }

      result[k] = Math.sqrt(real * real + imag * imag);
    }

    return result;
  }

  private calculateBandEnergy(band: Float32Array): number {
    let energy = 0;
    for (let i = 0; i < band.length; i++) {
      energy += band[i] * band[i];
    }
    return energy;
  }

  private calculateStereoWidth(buffer: Float32Array): number {
    return 0.5;
  }

  private estimateLUFS(rmsDB: number): number {
    return rmsDB + 3.01;
  }

  private calculateOptimalGain(analysis: AudioAnalysis): number {
    const headroom = -0.3;
    const targetPeak = headroom;
    
    return targetPeak - analysis.peakLevel;
  }

  private optimizeCompression(
    analysis: AudioAnalysis,
    targetGenre?: string
  ): {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  } {
    const genreSettings: Record<
      string,
      { threshold: number; ratio: number; attack: number; release: number }
    > = {
      rock: { threshold: -18, ratio: 4, attack: 10, release: 100 },
      pop: { threshold: -20, ratio: 6, attack: 5, release: 50 },
      'hip-hop': { threshold: -15, ratio: 8, attack: 3, release: 80 },
      electronic: { threshold: -12, ratio: 10, attack: 1, release: 30 },
      jazz: { threshold: -25, ratio: 2, attack: 20, release: 150 },
      classical: { threshold: -30, ratio: 1.5, attack: 30, release: 200 },
    };

    const settings = genreSettings[targetGenre || 'pop'] || genreSettings.pop;

    if (analysis.dynamicRange > 12) {
      settings.threshold -= 3;
      settings.ratio *= 0.8;
    } else if (analysis.dynamicRange < 6) {
      settings.threshold += 2;
      settings.ratio *= 1.2;
    }

    return settings;
  }

  private optimizeEQ(
    analysis: AudioAnalysis,
    targetGenre?: string
  ): Array<{ freq: number; gain: number; q: number }> {
    const bands: Array<{ freq: number; gain: number; q: number }> = [];

    const idealBalance = { low: 0.3, mid: 0.4, high: 0.3 };

    if (analysis.spectralBalance.low < idealBalance.low - 0.05) {
      bands.push({ freq: 80, gain: 3, q: 0.7 });
    } else if (analysis.spectralBalance.low > idealBalance.low + 0.05) {
      bands.push({ freq: 80, gain: -2, q: 0.7 });
    }

    if (analysis.spectralBalance.mid < idealBalance.mid - 0.05) {
      bands.push({ freq: 1000, gain: 2, q: 1.0 });
    } else if (analysis.spectralBalance.mid > idealBalance.mid + 0.05) {
      bands.push({ freq: 1000, gain: -2, q: 1.0 });
    }

    if (analysis.spectralBalance.high < idealBalance.high - 0.05) {
      bands.push({ freq: 8000, gain: 2, q: 0.7 });
    } else if (analysis.spectralBalance.high > idealBalance.high + 0.05) {
      bands.push({ freq: 8000, gain: -1, q: 0.7 });
    }

    return bands;
  }

  private calculateReverbMix(targetGenre?: string): number {
    const genreReverb: Record<string, number> = {
      rock: 0.15,
      pop: 0.20,
      'hip-hop': 0.10,
      electronic: 0.25,
      jazz: 0.30,
      classical: 0.40,
    };

    return genreReverb[targetGenre || 'pop'] || 0.20;
  }

  private optimizeStereoWidth(analysis: AudioAnalysis): number {
    if (analysis.stereoWidth < 0.3) {
      return 1.3;
    } else if (analysis.stereoWidth > 0.8) {
      return 0.9;
    }
    return 1.0;
  }

  private calculateLimiterRelease(dynamicRange: number): number {
    if (dynamicRange > 10) return 100;
    if (dynamicRange > 7) return 50;
    return 30;
  }

  private optimizeHighShelf(analysis: AudioAnalysis): number {
    if (analysis.spectralBalance.high < 0.25) {
      return 1.5;
    } else if (analysis.spectralBalance.high > 0.35) {
      return -1.0;
    }
    return 0;
  }

  private optimizeLowShelf(analysis: AudioAnalysis): number {
    if (analysis.spectralBalance.low < 0.25) {
      return 2.0;
    } else if (analysis.spectralBalance.low > 0.35) {
      return -1.5;
    }
    return 0;
  }

  public applyMixingParameters(
    audioBuffer: Float32Array,
    params: MixingParameters
  ): Float32Array {
    let processed = new Float32Array(audioBuffer);

    processed = this.applyGain(processed, params.gainDB);
    
    processed = this.applyCompression(processed, {
      threshold: params.compressorThreshold,
      ratio: params.compressorRatio,
      attack: params.compressorAttack,
      release: params.compressorRelease,
    });

    return processed;
  }

  private applyGain(buffer: Float32Array, gainDB: number): Float32Array {
    const gainLinear = Math.pow(10, gainDB / 20);
    const result = new Float32Array(buffer.length);
    
    for (let i = 0; i < buffer.length; i++) {
      result[i] = buffer[i] * gainLinear;
    }
    
    return result;
  }

  private applyCompression(
    buffer: Float32Array,
    params: { threshold: number; ratio: number; attack: number; release: number }
  ): Float32Array {
    const result = new Float32Array(buffer.length);
    const thresholdLinear = Math.pow(10, params.threshold / 20);
    let gainReduction = 0;

    for (let i = 0; i < buffer.length; i++) {
      const inputLevel = Math.abs(buffer[i]);

      if (inputLevel > thresholdLinear) {
        const overshoot = inputLevel / thresholdLinear;
        const targetGainReduction = 1 - 1 / (1 + (overshoot - 1) * (params.ratio - 1));
        
        gainReduction += (targetGainReduction - gainReduction) * 0.001;
      } else {
        gainReduction *= 0.999;
      }

      result[i] = buffer[i] * (1 - gainReduction);
    }

    return result;
  }
}
