/**
 * Audio Analysis Service using Web Audio API
 * Mobile-safe: all heavy loops capped to prevent main thread stall.
 * Yields to browser between computation phases via setTimeout(0).
 */

import { logger } from "@/lib/logger";

export interface AudioAnalysisResult {
  bpm: number;
  musicalKey: string;
  scale: string;
  energy: number;
  danceability: number;
  loudness: number;
  spectralCentroid: number;
  durationSeconds: number;
  beatPositions: number[];
}

export interface BeatMetadataSuggestion {
  bpm: number;
  key: string;
  genre: string;
  mood: string;
  tags: string[];
  energy: number;
  danceability: number;
  confidence: number;
}

// Yield control back to the browser between heavy computation phases.
// Prevents iOS from killing the tab for an unresponsive main thread.
function yieldToMain(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

class AudioAnalysisService {
  private audioContext: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (
        window.AudioContext ||
        (window as Record<string, unknown>).webkitAudioContext
      )();
    }
    return this.audioContext;
  }

  async analyzeAudioFile(audioFile: File): Promise<AudioAnalysisResult> {
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioContext = this.getAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Limit to first 10 seconds — sufficient for all feature extraction,
    // prevents allocating huge arrays for long tracks.
    const MAX_SECONDS = 10;
    const maxSamples = Math.min(
      audioBuffer.length,
      Math.floor(audioBuffer.sampleRate * MAX_SECONDS),
    );
    const fullMono = this.convertToMono(audioBuffer);
    const audioData = fullMono.slice(0, maxSamples);
    const sampleRate = audioBuffer.sampleRate;

    // Yield before each heavy phase so the browser can paint / handle events.
    await yieldToMain();
    const bpm = this.detectBPM(audioData, sampleRate);

    await yieldToMain();
    const keyResult = this.estimateKey(audioData, sampleRate);

    await yieldToMain();
    const energy = this.calculateEnergy(audioData);
    const loudness = this.calculateLoudness(audioData);
    const spectralCentroid = this.calculateSpectralCentroid(
      audioData,
      sampleRate,
    );

    await yieldToMain();
    const beatPositions = this.detectBeats(audioData, sampleRate);
    const danceability = this.estimateDanceability(beatPositions, energy);

    return {
      bpm,
      ...keyResult,
      energy,
      danceability,
      loudness,
      spectralCentroid,
      durationSeconds: audioBuffer.duration,
      beatPositions,
    };
  }

  /**
   * BPM via autocorrelation — capped at 100 outer iterations × 0.5 s inner window.
   * ~2.2 M multiply-adds total (was ~1.36 B).
   */
  private detectBPM(audioData: Float32Array, sampleRate: number): number {
    try {
      const minBPM = 60;
      const maxBPM = 200;
      const minLag = Math.floor((sampleRate * 60) / maxBPM);
      const maxLag = Math.floor((sampleRate * 60) / minBPM);

      // At most 2 seconds of audio for the outer search window
      const chunkSize = Math.min(audioData.length, sampleRate * 2);
      const chunk = audioData.slice(0, chunkSize);

      // Cap outer loop to ~100 lag values
      const lagStep = Math.max(1, Math.ceil((maxLag - minLag) / 100));
      // Cap inner loop to 0.5 s of samples
      const maxInner = Math.floor(sampleRate / 2);

      let bestCorrelation = -Infinity;
      let bestLag = minLag;

      for (let lag = minLag; lag < maxLag; lag += lagStep) {
        const samples = Math.min(chunkSize - lag, maxInner);
        if (samples <= 0) continue;
        let correlation = 0;
        for (let i = 0; i < samples; i++) {
          correlation += chunk[i] * chunk[i + lag];
        }
        correlation /= samples;
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestLag = lag;
        }
      }

      const bpm = Math.round((sampleRate * 60) / bestLag);
      return Math.max(minBPM, Math.min(maxBPM, bpm));
    } catch (err) {
      logger.error("BPM detection error:", err);
      return 120;
    }
  }

  /**
   * Key estimation via a single 512-point DFT on the first 512 samples.
   * ~131 K cos/sin calls total (was ~168 M).
   */
  private estimateKey(
    audioData: Float32Array,
    sampleRate: number,
  ): { musicalKey: string; scale: string } {
    try {
      const keys = [
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
      const chroma = new Float32Array(12);

      const fftSize = 512;
      const half = fftSize >> 1;
      const limit = Math.min(audioData.length, fftSize);

      for (let k = 0; k < half; k++) {
        const freq = (k * sampleRate) / fftSize;
        if (freq < 50 || freq > 2000) continue;

        let real = 0;
        let imag = 0;
        const angleBase = (-2 * Math.PI * k) / fftSize;
        for (let n = 0; n < limit; n++) {
          const angle = angleBase * n;
          real += audioData[n] * Math.cos(angle);
          imag += audioData[n] * Math.sin(angle);
        }

        const midiNote = 12 * Math.log2(freq / 440) + 69;
        const chromaIndex = ((Math.round(midiNote) % 12) + 12) % 12;
        chroma[chromaIndex] += Math.sqrt(real * real + imag * imag);
      }

      let maxChroma = 0;
      let keyIndex = 0;
      for (let i = 0; i < 12; i++) {
        if (chroma[i] > maxChroma) {
          maxChroma = chroma[i];
          keyIndex = i;
        }
      }

      const majorStrength =
        chroma[keyIndex] +
        chroma[(keyIndex + 4) % 12] +
        chroma[(keyIndex + 7) % 12];
      const minorStrength =
        chroma[keyIndex] +
        chroma[(keyIndex + 3) % 12] +
        chroma[(keyIndex + 7) % 12];
      const isMajor = majorStrength >= minorStrength;
      const minorKeyIndex = (keyIndex + 9) % 12;

      return {
        musicalKey: keys[isMajor ? keyIndex : minorKeyIndex],
        scale: isMajor ? "major" : "minor",
      };
    } catch (err) {
      logger.error("Key estimation error:", err);
      return { musicalKey: "C", scale: "major" };
    }
  }

  /**
   * Energy (RMS) over the (already-truncated) audio slice.
   */
  private calculateEnergy(audioData: Float32Array): number {
    try {
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      return Math.min(1, Math.sqrt(sum / audioData.length) * 5);
    } catch (err) {
      logger.error("Energy calculation error:", err);
      return 0.5;
    }
  }

  /**
   * Danceability derived from beat consistency + energy (no heavy loops).
   */
  private estimateDanceability(beats: number[], energy: number): number {
    try {
      if (beats.length < 4) return Math.round((0.3 + energy * 0.4) * 100) / 100;

      const intervals: number[] = [];
      for (let i = 1; i < beats.length; i++) {
        intervals.push(beats[i] - beats[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      let variance = 0;
      for (const iv of intervals) variance += (iv - avg) ** 2;
      variance /= intervals.length;

      const consistency = 1 / (1 + variance * 10);
      return Math.round((consistency * 0.6 + energy * 0.4) * 100) / 100;
    } catch (err) {
      logger.error("Danceability estimation error:", err);
      return 0.5;
    }
  }

  /**
   * Loudness (dBFS approximation).
   */
  private calculateLoudness(audioData: Float32Array): number {
    try {
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const db = 10 * Math.log10(Math.max(sum / audioData.length, 1e-10));
      return Math.round((db + 30) * 100) / 100;
    } catch (err) {
      logger.error("Loudness calculation error:", err);
      return -14.0;
    }
  }

  /**
   * Spectral centroid via a single 512-point DFT.
   * ~131 K cos/sin calls (was ~2 M).
   */
  private calculateSpectralCentroid(
    audioData: Float32Array,
    sampleRate: number,
  ): number {
    try {
      const fftSize = 512;
      const half = fftSize >> 1;
      const limit = Math.min(audioData.length, fftSize);

      let weightedSum = 0;
      let totalMagnitude = 0;

      for (let k = 1; k < half; k++) {
        const freq = (k * sampleRate) / fftSize;
        if (freq < 20 || freq > 8000) continue;

        let real = 0;
        let imag = 0;
        const angleBase = (-2 * Math.PI * k) / fftSize;
        for (let n = 0; n < limit; n++) {
          const angle = angleBase * n;
          real += audioData[n] * Math.cos(angle);
          imag += audioData[n] * Math.sin(angle);
        }
        const magnitude = Math.sqrt(real * real + imag * imag);
        weightedSum += freq * magnitude;
        totalMagnitude += magnitude;
      }

      return totalMagnitude > 0
        ? Math.round((weightedSum / totalMagnitude) * 100) / 100
        : 1500;
    } catch (err) {
      logger.error("Spectral centroid calculation error:", err);
      return 1500;
    }
  }

  /**
   * Beat detection via energy onset — O(N) over the (truncated) audio slice.
   */
  private detectBeats(audioData: Float32Array, sampleRate: number): number[] {
    try {
      const hopSize = Math.floor(sampleRate / 20);
      const numFrames = Math.floor(audioData.length / hopSize);
      const energies = new Float32Array(numFrames);

      for (let frame = 0; frame < numFrames; frame++) {
        let sum = 0;
        const start = frame * hopSize;
        for (let i = 0; i < hopSize && start + i < audioData.length; i++) {
          sum += audioData[start + i] * audioData[start + i];
        }
        energies[frame] = sum / hopSize;
      }

      const sorted = Array.from(energies).sort((a, b) => a - b);
      const threshold = sorted[Math.floor(sorted.length / 2)] * 2;

      const beats: number[] = [];
      for (let i = 1; i < numFrames; i++) {
        const onset = energies[i] - energies[i - 1];
        if (onset > threshold && energies[i] > threshold) {
          const time = (i * hopSize) / sampleRate;
          if (beats.length === 0 || time - beats[beats.length - 1] > 0.2) {
            beats.push(Math.round(time * 100) / 100);
          }
        }
      }
      return beats.slice(0, 200);
    } catch (err) {
      logger.error("Beat detection error:", err);
      return [];
    }
  }

  /**
   * Convert stereo/multi-channel AudioBuffer to mono Float32Array.
   */
  private convertToMono(audioBuffer: AudioBuffer): Float32Array {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0).slice();
    }
    const mono = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < audioBuffer.length; i++) {
        mono[i] += channelData[i] / audioBuffer.numberOfChannels;
      }
    }
    return mono;
  }

  async analyzeAudioURL(url: string): Promise<AudioAnalysisResult> {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], "audio.wav", { type: blob.type });
    return this.analyzeAudioFile(file);
  }

  async analyzeAndSuggestMetadata(
    audioFile: File,
  ): Promise<BeatMetadataSuggestion> {
    const analysis = await this.analyzeAudioFile(audioFile);
    return this.inferMetadata(analysis);
  }

  private inferMetadata(a: AudioAnalysisResult): BeatMetadataSuggestion {
    const genre = this.inferGenre(a);
    const mood = this.inferMood(a);
    const tags = this.inferTags(a, genre, mood);
    const confidence = this.calculateConfidence(a);
    return {
      bpm: a.bpm,
      key: a.musicalKey,
      genre,
      mood,
      tags,
      energy: Math.round(a.energy * 100) / 100,
      danceability: Math.round(a.danceability * 100) / 100,
      confidence,
    };
  }

  private inferGenre(a: AudioAnalysisResult): string {
    const { bpm, energy, danceability, spectralCentroid, scale } = a;
    if (bpm >= 130 && bpm <= 150 && energy > 0.5 && spectralCentroid < 2500)
      return "Trap";
    if (bpm >= 140 && energy > 0.6 && spectralCentroid > 3000)
      return "Electronic";
    if (bpm >= 85 && bpm <= 115 && energy < 0.4 && spectralCentroid < 2000)
      return "R&B";
    if (bpm >= 60 && bpm <= 100 && energy < 0.35 && danceability < 0.4)
      return "Ambient";
    if (bpm >= 85 && bpm <= 115 && energy > 0.35 && spectralCentroid < 2500)
      return "Hip-Hop";
    if (
      bpm >= 100 &&
      bpm <= 130 &&
      danceability > 0.6 &&
      spectralCentroid > 2500
    )
      return "Pop";
    if (bpm >= 115 && bpm <= 135 && danceability > 0.55 && energy > 0.45)
      return "Funk";
    if (bpm >= 60 && bpm <= 90 && energy < 0.3 && scale === "minor")
      return "Jazz";
    if (
      bpm >= 90 &&
      bpm <= 110 &&
      energy > 0.3 &&
      energy < 0.5 &&
      scale === "minor"
    )
      return "Soul";
    if (bpm >= 130 && energy > 0.7) return "Electronic";
    if (bpm >= 60 && bpm <= 80 && danceability > 0.5) return "Reggae";
    if (energy > 0.7 && spectralCentroid > 3500) return "Rock";
    if (bpm >= 100 && bpm <= 130 && energy > 0.5) return "Latin";
    if (energy > 0.4 && danceability > 0.5) return "Pop";
    return "Hip-Hop";
  }

  private inferMood(a: AudioAnalysisResult): string {
    const { energy, danceability, spectralCentroid, scale, bpm } = a;
    if (energy > 0.7 && danceability > 0.6) return "Energetic";
    if (energy > 0.65 && danceability < 0.4) return "Aggressive";
    if (energy < 0.25 && danceability < 0.35) return "Chill";
    if (energy < 0.3 && scale === "minor") return "Melancholic";
    if (energy > 0.5 && danceability > 0.55 && scale === "major")
      return "Happy";
    if (energy < 0.35 && spectralCentroid < 1500) return "Dark";
    if (energy > 0.4 && energy < 0.6 && spectralCentroid > 2500)
      return "Uplifting";
    if (energy < 0.4 && spectralCentroid > 2000) return "Romantic";
    if (energy > 0.5 && bpm > 120) return "Confident";
    if (scale === "minor" && energy > 0.4) return "Mysterious";
    if (energy < 0.4 && danceability > 0.4) return "Relaxed";
    if (spectralCentroid < 1800 && bpm < 100) return "Nostalgic";
    return "Modern";
  }

  private inferTags(
    a: AudioAnalysisResult,
    genre: string,
    mood: string,
  ): string[] {
    const tags: string[] = [genre.toLowerCase(), mood.toLowerCase()];
    if (a.bpm >= 130) tags.push("fast");
    if (a.bpm <= 85) tags.push("slow");
    if (a.energy > 0.65) tags.push("hard");
    if (a.energy < 0.3) tags.push("soft");
    if (a.danceability > 0.6) tags.push("groovy");
    if (a.scale === "minor") tags.push("minor key");
    if (a.scale === "major") tags.push("major key");
    if (a.spectralCentroid > 3000) tags.push("bright");
    if (a.spectralCentroid < 1500) tags.push("deep");
    if (a.loudness > 20) tags.push("loud");
    if (genre === "Trap") tags.push("808", "hi-hats");
    if (genre === "Hip-Hop") tags.push("boom bap", "rap");
    if (genre === "R&B") tags.push("smooth", "vocals");
    if (genre === "Electronic") tags.push("synth", "bass");
    if (genre === "Pop") tags.push("catchy", "mainstream");
    const bpmRange =
      a.bpm >= 120 ? "uptempo" : a.bpm >= 90 ? "mid-tempo" : "downtempo";
    tags.push(bpmRange);
    return [...new Set(tags)].slice(0, 10);
  }

  private calculateConfidence(a: AudioAnalysisResult): number {
    let confidence = 0.5;
    if (a.durationSeconds > 30) confidence += 0.15;
    if (a.durationSeconds > 60) confidence += 0.1;
    if (a.beatPositions.length > 10) confidence += 0.15;
    if (a.energy > 0.1 && a.energy < 0.9) confidence += 0.1;
    return Math.min(0.95, Math.round(confidence * 100) / 100);
  }
}

export const audioAnalysisService = new AudioAnalysisService();
