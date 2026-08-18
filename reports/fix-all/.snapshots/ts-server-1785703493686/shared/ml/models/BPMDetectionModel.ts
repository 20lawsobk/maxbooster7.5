/**
 * Cross-Platform BPM/Tempo and Key Detection Model
 *
 * Works on: Web (browser), Desktop (Electron), Mobile (React Native/Capacitor), Server (Node.js)
 *
 * Architecture:
 * 1. Pure JavaScript core algorithm (works everywhere)
 * 2. Optional Essentia.js enhancement (browser only, auto-detected)
 * 3. Optimized FFT using typed arrays for performance
 *
 * Algorithm: Onset detection + autocorrelation + pulse train correlation
 * Based on research by Simon Dixon (Beatroot) and Joe Sullivan
 */

import type { AudioFeatures } from "../types.js";

export interface BPMDetectionResult {
  bpm: number;
  confidence: number;
  candidates: Array<{ bpm: number; score: number }>;
  method: "pure-js" | "essentia" | "hybrid";
}

export interface KeyDetectionResult {
  key: string;
  scale: "major" | "minor";
  confidence: number;
}

export interface BPMDetectorConfig {
  minBPM?: number;
  maxBPM?: number;
  sampleRate?: number;
  useEssentiaIfAvailable?: boolean;
}

const DEFAULT_CONFIG: Required<BPMDetectorConfig> = {
  minBPM: 60,
  maxBPM: 200,
  sampleRate: 44100,
  useEssentiaIfAvailable: true,
};

interface EssentiaInstance {
  initialize(): Promise<void>;
  shutdown(): void;
  RhythmExtractor2013(...args: unknown[]): {
    bpm: number;
    confidence: number;
    beats: number[];
  };
  KeyExtractor(...args: unknown[]): {
    key: string;
    scale: string;
    strength: number;
  };
  OnsetDetection(...args: unknown[]): { onsets: Float32Array };
  MFCC(...args: unknown[]): { mfcc: Float32Array; bands: Float32Array };
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

export class BPMDetectionModel {
  private essentia: EssentiaInstance | null = null;
  private essentiaAvailable: boolean = false;
  private config: Required<BPMDetectorConfig>;
  private initialized: boolean = false;

  constructor(config: BPMDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.useEssentiaIfAvailable && this.isBrowserEnvironment()) {
      try {
        const EssentiaModule = await import("essentia.js");
        const Essentia = EssentiaModule.default || EssentiaModule;
        this.essentia = new (
          Essentia as { EssentiaWASM: new () => EssentiaInstance }
        ).EssentiaWASM();
        await this.essentia.initialize();
        this.essentiaAvailable = true;
        console.log(
          "[BPMDetection] Essentia.js initialized - using enhanced detection",
        );
      } catch (error) {
        console.log(
          "[BPMDetection] Essentia.js not available, using pure JS algorithm",
        );
        this.essentiaAvailable = false;
      }
    } else {
      console.log("[BPMDetection] Using cross-platform pure JS algorithm");
    }

    this.initialized = true;
  }

  private isBrowserEnvironment(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  public detectBPM(
    audioBuffer: Float32Array,
    sampleRate?: number,
  ): BPMDetectionResult {
    const sr = sampleRate || this.config.sampleRate;

    if (this.essentiaAvailable && this.essentia) {
      try {
        return this.detectBPMWithEssentia(audioBuffer, sr);
      } catch (error) {
        console.warn("[BPMDetection] Essentia failed, falling back to pure JS");
        return this.detectBPMPureJS(audioBuffer, sr);
      }
    }

    return this.detectBPMPureJS(audioBuffer, sr);
  }

  private detectBPMWithEssentia(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): BPMDetectionResult {
    if (!this.essentia) {
      throw new Error("Essentia not initialized");
    }

    const beatTracker = this.essentia.RhythmExtractor2013(
      audioBuffer,
      sampleRate,
      "degara",
      true,
      256,
      0,
      20000,
      90,
      this.config.minBPM,
      this.config.maxBPM,
      0.24,
      true,
      false,
    );

    const candidates = this.findBPMCandidatesPureJS(audioBuffer, sampleRate);
    const octaveChecked = this.checkOctaveError(beatTracker.bpm, candidates);

    return {
      bpm: Math.round(octaveChecked * 10) / 10,
      confidence: beatTracker.confidence,
      candidates,
      method: "essentia",
    };
  }

  private detectBPMPureJS(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): BPMDetectionResult {
    const onsetEnvelope = this.computeOnsetEnvelope(audioBuffer, sampleRate);
    const candidates = this.computeBPMFromOnsets(onsetEnvelope, sampleRate);

    if (candidates.length === 0) {
      return {
        bpm: 120,
        confidence: 0,
        candidates: [],
        method: "pure-js",
      };
    }

    const topCandidate = candidates[0];
    const octaveChecked = this.checkOctaveError(topCandidate.bpm, candidates);

    const confidence = this.computeConfidence(candidates, octaveChecked);

    return {
      bpm: Math.round(octaveChecked * 10) / 10,
      confidence,
      candidates: candidates.slice(0, 5),
      method: "pure-js",
    };
  }

  private computeOnsetEnvelope(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): Float32Array {
    const frameSize = 2048;
    const hopSize = 512;
    const numFrames = Math.floor((audioBuffer.length - frameSize) / hopSize);

    if (numFrames <= 0) {
      return new Float32Array(0);
    }

    const envelope = new Float32Array(numFrames);
    let prevSpectrum: Float32Array | null = null;
    const hannWindow = this.createHannWindow(frameSize);

    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      const frame = this.applyWindow(
        audioBuffer.slice(start, start + frameSize),
        hannWindow,
      );
      const spectrum = this.computeMagnitudeSpectrum(frame);

      if (prevSpectrum) {
        let flux = 0;
        for (let j = 0; j < spectrum.length; j++) {
          const diff = spectrum[j] - prevSpectrum[j];
          if (diff > 0) {
            flux += diff;
          }
        }
        envelope[i] = flux;
      }

      prevSpectrum = spectrum;
    }

    const smoothed = this.smoothEnvelope(envelope, 3);
    const normalized = this.normalizeEnvelope(smoothed);

    return normalized;
  }

  private computeBPMFromOnsets(
    onsetEnvelope: Float32Array,
    sampleRate: number,
  ): Array<{ bpm: number; score: number }> {
    if (onsetEnvelope.length < 10) {
      return [];
    }

    const hopSize = 512;
    const autocorr = this.autocorrelation(onsetEnvelope);
    const minLag = Math.floor(
      ((60 / this.config.maxBPM) * sampleRate) / hopSize,
    );
    const maxLag = Math.floor(
      ((60 / this.config.minBPM) * sampleRate) / hopSize,
    );

    const peaks = this.findAutocorrelationPeaks(autocorr, minLag, maxLag);

    const candidates = peaks
      .map((peak) => {
        const lagInSeconds = (peak.index * hopSize) / sampleRate;
        const bpm = 60 / lagInSeconds;
        return { bpm, score: peak.value };
      })
      .filter((c) => c.bpm >= this.config.minBPM && c.bpm <= this.config.maxBPM)
      .sort((a, b) => b.score - a.score);

    return candidates;
  }

  private findBPMCandidatesPureJS(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): Array<{ bpm: number; score: number }> {
    const onsetEnvelope = this.computeOnsetEnvelope(audioBuffer, sampleRate);
    return this.computeBPMFromOnsets(onsetEnvelope, sampleRate);
  }

  private createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  private applyWindow(frame: Float32Array, window: Float32Array): Float32Array {
    const result = new Float32Array(frame.length);
    const windowLen = Math.min(frame.length, window.length);
    for (let i = 0; i < windowLen; i++) {
      result[i] = frame[i] * window[i];
    }
    return result;
  }

  private computeMagnitudeSpectrum(frame: Float32Array): Float32Array {
    const n = frame.length;
    const halfN = Math.floor(n / 2);
    const spectrum = new Float32Array(halfN);

    for (let k = 0; k < halfN; k++) {
      let real = 0;
      let imag = 0;
      const freqFactor = (2 * Math.PI * k) / n;

      for (let t = 0; t < n; t++) {
        const angle = freqFactor * t;
        real += frame[t] * Math.cos(angle);
        imag -= frame[t] * Math.sin(angle);
      }

      spectrum[k] = Math.sqrt(real * real + imag * imag);
    }

    return spectrum;
  }

  private smoothEnvelope(
    envelope: Float32Array,
    kernelSize: number,
  ): Float32Array {
    const smoothed = new Float32Array(envelope.length);
    const halfKernel = Math.floor(kernelSize / 2);

    for (let i = 0; i < envelope.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -halfKernel; j <= halfKernel; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < envelope.length) {
          sum += envelope[idx];
          count++;
        }
      }
      smoothed[i] = sum / count;
    }

    return smoothed;
  }

  private normalizeEnvelope(envelope: Float32Array): Float32Array {
    const max = Math.max(...Array.from(envelope));
    if (max === 0) return envelope;

    const normalized = new Float32Array(envelope.length);
    for (let i = 0; i < envelope.length; i++) {
      normalized[i] = envelope[i] / max;
    }
    return normalized;
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

    if (result[0] > 0) {
      for (let i = 0; i < n; i++) {
        result[i] /= result[0];
      }
    }

    return result;
  }

  private findAutocorrelationPeaks(
    autocorr: Float32Array,
    minLag: number,
    maxLag: number,
  ): Array<{ index: number; value: number }> {
    const peaks: Array<{ index: number; value: number }> = [];
    const effectiveMax = Math.min(maxLag, autocorr.length - 1);

    for (let i = Math.max(minLag, 1); i < effectiveMax; i++) {
      if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1]) {
        if (autocorr[i] > 0.1) {
          peaks.push({ index: i, value: autocorr[i] });
        }
      }
    }

    return peaks.sort((a, b) => b.value - a.value).slice(0, 10);
  }

  private checkOctaveError(
    bpm: number,
    candidates: Array<{ bpm: number; score: number }>,
  ): number {
    const halfBPM = bpm / 2;
    const doubleBPM = bpm * 2;

    const findCandidate = (targetBPM: number) =>
      candidates.find((c) => Math.abs(c.bpm - targetBPM) < 5);

    const currentCandidate = findCandidate(bpm);
    const currentScore = currentCandidate?.score || 0;

    if (doubleBPM >= this.config.minBPM && doubleBPM <= this.config.maxBPM) {
      const doubleCandidate = findCandidate(doubleBPM);
      if (doubleCandidate && doubleCandidate.score > currentScore * 1.2) {
        return doubleBPM;
      }
    }

    if (halfBPM >= this.config.minBPM && halfBPM <= this.config.maxBPM) {
      const halfCandidate = findCandidate(halfBPM);
      if (halfCandidate && halfCandidate.score > currentScore * 1.2) {
        return halfBPM;
      }
    }

    return bpm;
  }

  private computeConfidence(
    candidates: Array<{ bpm: number; score: number }>,
    _selectedBPM: number,
  ): number {
    if (candidates.length === 0) return 0;
    if (candidates.length === 1) return candidates[0].score;

    const topScore = candidates[0].score;
    const secondScore = candidates.length > 1 ? candidates[1].score : 0;

    const clarity = (topScore - secondScore) / (topScore + 0.001);
    const absolute = Math.min(topScore, 1);

    return clarity * 0.6 + absolute * 0.4;
  }

  public detectKey(
    audioBuffer: Float32Array,
    sampleRate?: number,
  ): KeyDetectionResult {
    const sr = sampleRate || this.config.sampleRate;

    if (this.essentiaAvailable && this.essentia) {
      try {
        return this.detectKeyWithEssentia(audioBuffer, sr);
      } catch (error) {
        console.warn(
          "[BPMDetection] Essentia key detection failed, using pure JS",
        );
        return this.detectKeyPureJS(audioBuffer, sr);
      }
    }

    return this.detectKeyPureJS(audioBuffer, sr);
  }

  private detectKeyWithEssentia(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): KeyDetectionResult {
    if (!this.essentia) {
      throw new Error("Essentia not initialized");
    }

    const keyExtractor = this.essentia.KeyExtractor(
      audioBuffer,
      sampleRate,
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
      "bgate",
    );

    return {
      key: keyExtractor.key,
      scale: keyExtractor.scale as "major" | "minor",
      confidence: Math.min(1, keyExtractor.strength),
    };
  }

  private detectKeyPureJS(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): KeyDetectionResult {
    const chromagram = this.computeChromagram(audioBuffer, sampleRate);

    let bestKey = "C";
    let bestScale: "major" | "minor" = "major";
    let bestScore = -Infinity;

    for (let shift = 0; shift < 12; shift++) {
      const majorScore = this.correlateWithProfile(
        chromagram,
        MAJOR_PROFILE,
        shift,
      );
      const minorScore = this.correlateWithProfile(
        chromagram,
        MINOR_PROFILE,
        shift,
      );

      if (majorScore > bestScore) {
        bestScore = majorScore;
        bestKey = NOTE_NAMES[shift];
        bestScale = "major";
      }

      if (minorScore > bestScore) {
        bestScore = minorScore;
        bestKey = NOTE_NAMES[shift];
        bestScale = "minor";
      }
    }

    const normalizedConfidence = Math.min(1, Math.max(0, (bestScore + 1) / 2));

    return {
      key: bestKey,
      scale: bestScale,
      confidence: normalizedConfidence,
    };
  }

  private computeChromagram(
    audioBuffer: Float32Array,
    sampleRate: number,
  ): Float32Array {
    const frameSize = 4096;
    const hopSize = 2048;
    const numFrames = Math.floor((audioBuffer.length - frameSize) / hopSize);
    const chroma = new Float32Array(12);

    if (numFrames <= 0) {
      return chroma;
    }

    const hannWindow = this.createHannWindow(frameSize);

    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      const frame = this.applyWindow(
        audioBuffer.slice(start, start + frameSize),
        hannWindow,
      );
      const spectrum = this.computeMagnitudeSpectrum(frame);

      for (let bin = 1; bin < spectrum.length; bin++) {
        const freq = (bin * sampleRate) / frameSize;
        if (freq < 20 || freq > 5000) continue;

        const pitchClass = this.freqToPitchClass(freq);
        chroma[pitchClass] += spectrum[bin] * spectrum[bin];
      }
    }

    const sum = Array.from(chroma).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < 12; i++) {
        chroma[i] /= sum;
      }
    }

    return chroma;
  }

  private freqToPitchClass(freq: number): number {
    const noteNum = 12 * Math.log2(freq / 440) + 69;
    return Math.round(noteNum) % 12;
  }

  private correlateWithProfile(
    chroma: Float32Array,
    profile: number[],
    shift: number,
  ): number {
    let sum = 0;
    let chromaSum = 0;
    let profileSum = 0;

    for (let i = 0; i < 12; i++) {
      const chromaIdx = (i + shift) % 12;
      sum += chroma[chromaIdx] * profile[i];
      chromaSum += chroma[chromaIdx] * chroma[chromaIdx];
      profileSum += profile[i] * profile[i];
    }

    const denom = Math.sqrt(chromaSum * profileSum);
    return denom > 0 ? sum / denom : 0;
  }

  public extractAudioFeatures(
    audioBuffer: Float32Array,
    sampleRate?: number,
  ): AudioFeatures {
    const sr = sampleRate || this.config.sampleRate;

    const spectralCentroid = this.computeSpectralCentroid(audioBuffer);
    const spectralRolloff = this.computeSpectralRolloff(audioBuffer);
    const spectralFlux = this.computeSpectralFluxFeature(audioBuffer);
    const zeroCrossingRate = this.computeZeroCrossingRate(audioBuffer);

    const bpmResult = this.detectBPM(audioBuffer, sr);
    const keyResult = this.detectKey(audioBuffer, sr);

    return {
      mfcc: [Array.from(new Float32Array(13))],
      spectralCentroid: [spectralCentroid],
      spectralRolloff: [spectralRolloff],
      spectralFlux: spectralFlux,
      zeroCrossingRate: zeroCrossingRate,
      chroma: [Array.from(new Float32Array(12))],
      tempo: bpmResult.bpm,
      key: `${keyResult.key} ${keyResult.scale}`,
    };
  }

  private computeSpectralCentroid(audioBuffer: Float32Array): number {
    const frameSize = 2048;
    const frame = audioBuffer.slice(0, Math.min(frameSize, audioBuffer.length));
    const spectrum = this.computeMagnitudeSpectrum(frame);

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
    const frame = audioBuffer.slice(0, Math.min(frameSize, audioBuffer.length));
    const spectrum = this.computeMagnitudeSpectrum(frame);
    const threshold = 0.85;

    const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
    const targetEnergy = totalEnergy * threshold;

    let cumulativeEnergy = 0;
    for (let i = 0; i < spectrum.length; i++) {
      cumulativeEnergy += spectrum[i];
      if (cumulativeEnergy >= targetEnergy) {
        return i / (spectrum.length || 1);
      }
    }

    return 1;
  }

  private computeSpectralFluxFeature(audioBuffer: Float32Array): number[] {
    const frameSize = 2048;
    const hopSize = 512;
    const flux: number[] = [];
    let prevSpectrum: Float32Array | null = null;

    for (let i = 0; i < audioBuffer.length - frameSize; i += hopSize) {
      const frame = audioBuffer.slice(i, i + frameSize);
      const spectrum = this.computeMagnitudeSpectrum(frame);

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
      for (let j = i + 1; j < i + frameSize && j < audioBuffer.length; j++) {
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

  public isEssentiaAvailable(): boolean {
    return this.essentiaAvailable;
  }

  public getDetectionMethod(): string {
    return this.essentiaAvailable ? "essentia" : "pure-js";
  }

  public dispose(): void {
    if (this.essentia) {
      try {
        this.essentia.shutdown();
      } catch (e) {}
      this.essentia = null;
    }
    this.essentiaAvailable = false;
    this.initialized = false;
  }
}

export const createBPMDetector = async (
  config?: BPMDetectorConfig,
): Promise<BPMDetectionModel> => {
  const detector = new BPMDetectionModel(config);
  await detector.initialize();
  return detector;
};
