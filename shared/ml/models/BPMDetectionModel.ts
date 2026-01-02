/**
 * Custom BPM/Tempo and Key Detection Model
 * Uses Essentia.js for professional music analysis
 * Based on onset detection + autocorrelation + pulse train correlation
 */

import type { AudioFeatures } from '../types.js';

export interface BPMDetectionResult {
  bpm: number;
  confidence: number;
  candidates: Array<{ bpm: number; score: number }>;
}

export interface KeyDetectionResult {
  key: string;
  scale: 'major' | 'minor';
  confidence: number;
}

interface EssentiaInstance {
  initialize(): Promise<void>;
  shutdown(): void;
  RhythmExtractor2013(...args: unknown[]): { bpm: number; confidence: number; beats: number[] };
  KeyExtractor(...args: unknown[]): { key: string; scale: string; strength: number };
  OnsetDetection(...args: unknown[]): { onsets: Float32Array };
  MFCC(...args: unknown[]): { mfcc: Float32Array; bands: Float32Array };
}

export class BPMDetectionModel {
  private essentia: EssentiaInstance | null = null;

  constructor() {
  }

  public async initialize(): Promise<void> {
    if (typeof window !== 'undefined') {
      const EssentiaModule = await import('essentia.js');
      const Essentia = EssentiaModule.default || EssentiaModule;
      this.essentia = new (Essentia as { EssentiaWASM: new () => EssentiaInstance }).EssentiaWASM();
      await this.essentia.initialize();
    } else {
      throw new Error('Essentia.js only works in browser environment');
    }
  }

  public detectBPM(audioBuffer: Float32Array): BPMDetectionResult {
    if (!this.essentia) {
      throw new Error('Essentia not initialized. Call initialize() first.');
    }

    const beatTracker = this.essentia.RhythmExtractor2013(
      audioBuffer,
      44100,
      'degara',
      true,
      256,
      0,
      20000,
      90,
      40,
      208,
      0.24,
      true,
      false
    );

    const bpm = beatTracker.bpm;
    const confidence = beatTracker.confidence;
    const beats = beatTracker.beats;

    const candidates = this.findBPMCandidates(audioBuffer);

    const octaveChecked = this.checkOctaveError(bpm, candidates);

    return {
      bpm: octaveChecked,
      confidence,
      candidates,
    };
  }

  private findBPMCandidates(audioBuffer: Float32Array): Array<{ bpm: number; score: number }> {
    const onsets = this.detectOnsets(audioBuffer);
    
    const autocorr = this.autocorrelation(onsets);
    
    const peaks = this.findPeaks(autocorr);
    
    const candidates = peaks
      .map(peakIdx => {
        const lagInSeconds = peakIdx / 44100;
        const bpm = 60 / lagInSeconds;
        const score = autocorr[peakIdx];
        return { bpm, score };
      })
      .filter(c => c.bpm >= 60 && c.bpm <= 180)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return candidates;
  }

  private detectOnsets(audioBuffer: Float32Array): Float32Array {
    const frameSize = 2048;
    const hopSize = 512;
    const onsetStrength: number[] = [];

    for (let i = 0; i < audioBuffer.length - frameSize; i += hopSize) {
      const frame = audioBuffer.slice(i, i + frameSize);
      const flux = this.spectralFlux(frame);
      onsetStrength.push(flux);
    }

    return new Float32Array(onsetStrength);
  }

  private spectralFlux(frame: Float32Array): number {
    const fft = this.simpleFFT(frame);
    const magnitude = fft.map(Math.abs);
    
    const flux = magnitude.reduce((sum, val) => sum + val, 0);
    return flux;
  }

  private simpleFFT(signal: Float32Array): Float32Array {
    const n = signal.length;
    const result = new Float32Array(n);
    
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

  private autocorrelation(signal: Float32Array): Float32Array {
    const n = signal.length;
    const result = new Float32Array(n);

    for (let lag = 0; lag < n; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += signal[i] * signal[i + lag];
      }
      result[lag] = sum;
    }

    return result;
  }

  private findPeaks(signal: Float32Array): number[] {
    const peaks: number[] = [];
    
    for (let i = 1; i < signal.length - 1; i++) {
      if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
        if (signal[i] > 0.3 * Math.max(...Array.from(signal))) {
          peaks.push(i);
        }
      }
    }
    
    return peaks;
  }

  private checkOctaveError(
    bpm: number,
    candidates: Array<{ bpm: number; score: number }>
  ): number {
    const halfBPM = bpm / 2;
    const doubleBPM = bpm * 2;

    const hasHalfCandidate = candidates.some(c => Math.abs(c.bpm - halfBPM) < 3);
    const hasDoubleCandidate = candidates.some(c => Math.abs(c.bpm - doubleBPM) < 3);

    if (hasDoubleCandidate && doubleBPM >= 60 && doubleBPM <= 180) {
      const doubleScore = candidates.find(c => Math.abs(c.bpm - doubleBPM) < 3)?.score || 0;
      const currentScore = candidates.find(c => Math.abs(c.bpm - bpm) < 3)?.score || 0;
      
      if (doubleScore > currentScore * 1.2) {
        return doubleBPM;
      }
    }

    if (hasHalfCandidate && halfBPM >= 60 && halfBPM <= 180) {
      const halfScore = candidates.find(c => Math.abs(c.bpm - halfBPM) < 3)?.score || 0;
      const currentScore = candidates.find(c => Math.abs(c.bpm - bpm) < 3)?.score || 0;
      
      if (halfScore > currentScore * 1.2) {
        return halfBPM;
      }
    }

    return bpm;
  }

  public detectKey(audioBuffer: Float32Array): KeyDetectionResult {
    if (!this.essentia) {
      throw new Error('Essentia not initialized');
    }

    const keyExtractor = this.essentia.KeyExtractor(
      audioBuffer,
      44100,
      0.2,
      4096,
      4096,
      12,
      0.5,
      25,
      20000,
      0.0001,
      440,
      false,
      'bgate'
    );

    const key = keyExtractor.key;
    const scale = keyExtractor.scale;
    const strength = keyExtractor.strength;

    return {
      key,
      scale: scale as 'major' | 'minor',
      confidence: Math.min(1, strength),
    };
  }

  public extractAudioFeatures(audioBuffer: Float32Array): AudioFeatures {
    if (!this.essentia) {
      throw new Error('Essentia not initialized');
    }

    const mfccExtractor = this.essentia.MFCC(
      audioBuffer,
      40,
      2048,
      512,
      44100,
      128,
      20,
      8000,
      'htk'
    );

    const spectralCentroid = this.computeSpectralCentroid(audioBuffer);
    const spectralRolloff = this.computeSpectralRolloff(audioBuffer);
    const spectralFlux = this.computeSpectralFlux(audioBuffer);
    const zeroCrossingRate = this.computeZeroCrossingRate(audioBuffer);

    const bpmResult = this.detectBPM(audioBuffer);
    const keyResult = this.detectKey(audioBuffer);

    return {
      mfcc: [mfccExtractor.mfcc],
      spectralCentroid: [spectralCentroid],
      spectralRolloff: [spectralRolloff],
      spectralFlux: [spectralFlux],
      zeroCrossingRate: [zeroCrossingRate],
      chroma: [[]],
      tempo: bpmResult.bpm,
      key: `${keyResult.key} ${keyResult.scale}`,
    };
  }

  private computeSpectralCentroid(audioBuffer: Float32Array): number {
    const frameSize = 2048;
    const spectrum = this.simpleFFT(audioBuffer.slice(0, frameSize));
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < spectrum.length; i++) {
      numerator += i * spectrum[i];
      denominator += spectrum[i];
    }
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  private computeSpectralRolloff(audioBuffer: Float32Array): number {
    const frameSize = 2048;
    const spectrum = this.simpleFFT(audioBuffer.slice(0, frameSize));
    const threshold = 0.85;
    
    const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
    const targetEnergy = totalEnergy * threshold;
    
    let cumulativeEnergy = 0;
    for (let i = 0; i < spectrum.length; i++) {
      cumulativeEnergy += spectrum[i];
      if (cumulativeEnergy >= targetEnergy) {
        return i / spectrum.length;
      }
    }
    
    return 1;
  }

  private computeSpectralFlux(audioBuffer: Float32Array): number[] {
    const frameSize = 2048;
    const hopSize = 512;
    const flux: number[] = [];

    let prevSpectrum: Float32Array | null = null;

    for (let i = 0; i < audioBuffer.length - frameSize; i += hopSize) {
      const frame = audioBuffer.slice(i, i + frameSize);
      const spectrum = this.simpleFFT(frame);

      if (prevSpectrum) {
        let diff = 0;
        for (let j = 0; j < spectrum.length; j++) {
          diff += Math.abs(spectrum[j] - prevSpectrum[j]);
        }
        flux.push(diff);
      }

      prevSpectrum = spectrum;
    }

    return flux;
  }

  private computeZeroCrossingRate(audioBuffer: Float32Array): number[] {
    const frameSize = 2048;
    const hopSize = 512;
    const zcr: number[] = [];

    for (let i = 0; i < audioBuffer.length - frameSize; i += hopSize) {
      let crossings = 0;
      for (let j = i + 1; j < i + frameSize; j++) {
        if (
          (audioBuffer[j] >= 0 && audioBuffer[j - 1] < 0) ||
          (audioBuffer[j] < 0 && audioBuffer[j - 1] >= 0)
        ) {
          crossings++;
        }
      }
      zcr.push(crossings / frameSize);
    }

    return zcr;
  }

  public dispose(): void {
    if (this.essentia) {
      this.essentia.shutdown();
    }
  }
}
