/**
 * Audio Analysis Service using Web Audio API
 * Implements BPM detection, key estimation, and audio feature extraction
 * 
 * Uses native Web Audio API to avoid bundling heavy external libraries (2.6MB+)
 */

import { logger } from '@/lib/logger';

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

class AudioAnalysisService {
  private audioContext: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Analyze audio file and extract all features using Web Audio API
   */
  async analyzeAudioFile(audioFile: File): Promise<AudioAnalysisResult> {
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioContext = this.getAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = this.convertToMono(audioBuffer);

    const analysis: AudioAnalysisResult = {
      bpm: this.detectBPM(audioData, audioBuffer.sampleRate),
      ...this.estimateKey(audioData, audioBuffer.sampleRate),
      energy: this.calculateEnergy(audioData),
      danceability: this.estimateDanceability(audioData, audioBuffer.sampleRate),
      loudness: this.calculateLoudness(audioData),
      spectralCentroid: this.calculateSpectralCentroid(audioData, audioBuffer.sampleRate),
      durationSeconds: audioBuffer.duration,
      beatPositions: this.detectBeats(audioData, audioBuffer.sampleRate),
    };

    return analysis;
  }

  /**
   * Detect BPM using autocorrelation method
   */
  private detectBPM(audioData: Float32Array, sampleRate: number): number {
    try {
      const minBPM = 60;
      const maxBPM = 200;
      const minLag = Math.floor(sampleRate * 60 / maxBPM);
      const maxLag = Math.floor(sampleRate * 60 / minBPM);
      
      const chunkSize = Math.min(audioData.length, sampleRate * 10);
      const chunk = audioData.slice(0, chunkSize);
      
      let bestCorrelation = -1;
      let bestLag = minLag;
      
      for (let lag = minLag; lag < maxLag; lag += 2) {
        let correlation = 0;
        const samples = Math.min(chunkSize - lag, sampleRate * 2);
        
        for (let i = 0; i < samples; i++) {
          correlation += chunk[i] * chunk[i + lag];
        }
        correlation /= samples;
        
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestLag = lag;
        }
      }
      
      const bpm = Math.round(sampleRate * 60 / bestLag);
      return Math.max(minBPM, Math.min(maxBPM, bpm));
    } catch (error) {
      logger.error('BPM detection error:', error);
      return 120;
    }
  }

  /**
   * Estimate musical key using spectral analysis
   */
  private estimateKey(audioData: Float32Array, sampleRate: number): { musicalKey: string; scale: string } {
    try {
      const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const fftSize = 4096;
      const chroma = new Float32Array(12);
      
      const numChunks = Math.floor(audioData.length / fftSize);
      
      for (let chunk = 0; chunk < Math.min(numChunks, 20); chunk++) {
        const start = chunk * fftSize;
        const windowed = new Float32Array(fftSize);
        
        for (let i = 0; i < fftSize; i++) {
          const hannWindow = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
          windowed[i] = audioData[start + i] * hannWindow;
        }
        
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);
        
        for (let k = 0; k < fftSize / 2; k++) {
          let sumReal = 0, sumImag = 0;
          for (let n = 0; n < fftSize; n++) {
            const angle = -2 * Math.PI * k * n / fftSize;
            sumReal += windowed[n] * Math.cos(angle);
            sumImag += windowed[n] * Math.sin(angle);
          }
          real[k] = sumReal;
          imag[k] = sumImag;
        }
        
        for (let bin = 1; bin < fftSize / 2; bin++) {
          const freq = bin * sampleRate / fftSize;
          if (freq < 50 || freq > 5000) continue;
          
          const midiNote = 12 * Math.log2(freq / 440) + 69;
          const chromaIndex = Math.round(midiNote) % 12;
          const magnitude = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
          chroma[chromaIndex] += magnitude;
        }
      }
      
      let maxChroma = 0;
      let keyIndex = 0;
      for (let i = 0; i < 12; i++) {
        if (chroma[i] > maxChroma) {
          maxChroma = chroma[i];
          keyIndex = i;
        }
      }
      
      const minorKeyIndex = (keyIndex + 9) % 12;
      const majorStrength = chroma[keyIndex] + chroma[(keyIndex + 4) % 12] + chroma[(keyIndex + 7) % 12];
      const minorStrength = chroma[keyIndex] + chroma[(keyIndex + 3) % 12] + chroma[(keyIndex + 7) % 12];
      
      const isMajor = majorStrength >= minorStrength;
      
      return {
        musicalKey: keys[isMajor ? keyIndex : minorKeyIndex],
        scale: isMajor ? 'major' : 'minor',
      };
    } catch (error) {
      logger.error('Key estimation error:', error);
      return { musicalKey: 'C', scale: 'major' };
    }
  }

  /**
   * Calculate energy (RMS)
   */
  private calculateEnergy(audioData: Float32Array): number {
    try {
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sum / audioData.length);
      return Math.min(1, rms * 5);
    } catch (error) {
      logger.error('Energy calculation error:', error);
      return 0.5;
    }
  }

  /**
   * Estimate danceability based on beat consistency
   */
  private estimateDanceability(audioData: Float32Array, sampleRate: number): number {
    try {
      const beats = this.detectBeats(audioData, sampleRate);
      if (beats.length < 4) return 0.5;
      
      const intervals = [];
      for (let i = 1; i < beats.length; i++) {
        intervals.push(beats[i] - beats[i - 1]);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      let variance = 0;
      for (const interval of intervals) {
        variance += Math.pow(interval - avgInterval, 2);
      }
      variance /= intervals.length;
      
      const consistency = 1 / (1 + variance * 10);
      const energy = this.calculateEnergy(audioData);
      
      return Math.round((consistency * 0.6 + energy * 0.4) * 100) / 100;
    } catch (error) {
      logger.error('Danceability estimation error:', error);
      return 0.5;
    }
  }

  /**
   * Calculate loudness approximation
   */
  private calculateLoudness(audioData: Float32Array): number {
    try {
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const meanSquare = sum / audioData.length;
      const db = 10 * Math.log10(Math.max(meanSquare, 1e-10));
      return Math.round((db + 30) * 100) / 100;
    } catch (error) {
      logger.error('Loudness calculation error:', error);
      return -14.0;
    }
  }

  /**
   * Calculate spectral centroid (brightness)
   */
  private calculateSpectralCentroid(audioData: Float32Array, sampleRate: number): number {
    try {
      const fftSize = 2048;
      let weightedSum = 0;
      let totalMagnitude = 0;
      
      for (let bin = 1; bin < fftSize / 2; bin++) {
        let real = 0, imag = 0;
        for (let i = 0; i < Math.min(audioData.length, fftSize); i++) {
          const angle = -2 * Math.PI * bin * i / fftSize;
          real += audioData[i] * Math.cos(angle);
          imag += audioData[i] * Math.sin(angle);
        }
        const magnitude = Math.sqrt(real * real + imag * imag);
        const freq = bin * sampleRate / fftSize;
        weightedSum += freq * magnitude;
        totalMagnitude += magnitude;
      }
      
      const centroid = totalMagnitude > 0 ? weightedSum / totalMagnitude : 1500;
      return Math.round(centroid * 100) / 100;
    } catch (error) {
      logger.error('Spectral centroid calculation error:', error);
      return 1500;
    }
  }

  /**
   * Detect beat positions using onset detection
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
      
      const beats: number[] = [];
      const threshold = this.calculateAdaptiveThreshold(energies);
      
      for (let i = 1; i < numFrames; i++) {
        const onset = energies[i] - energies[i - 1];
        if (onset > threshold && energies[i] > threshold) {
          const time = (i * hopSize) / sampleRate;
          if (beats.length === 0 || time - beats[beats.length - 1] > 0.2) {
            beats.push(Math.round(time * 100) / 100);
          }
        }
      }
      
      return beats.slice(0, 500);
    } catch (error) {
      logger.error('Beat detection error:', error);
      return [];
    }
  }

  /**
   * Calculate adaptive threshold for beat detection
   */
  private calculateAdaptiveThreshold(energies: Float32Array): number {
    const sorted = Array.from(energies).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return median * 2;
  }

  /**
   * Convert stereo/multi-channel AudioBuffer to mono Float32Array
   */
  private convertToMono(audioBuffer: AudioBuffer): Float32Array {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }

    const monoData = new Float32Array(audioBuffer.length);
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < audioBuffer.length; i++) {
        monoData[i] += channelData[i] / audioBuffer.numberOfChannels;
      }
    }

    return monoData;
  }

  /**
   * Analyze audio from URL
   */
  async analyzeAudioURL(url: string): Promise<AudioAnalysisResult> {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], 'audio.wav', { type: blob.type });
    return this.analyzeAudioFile(file);
  }

  async analyzeAndSuggestMetadata(audioFile: File): Promise<BeatMetadataSuggestion> {
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

    if (bpm >= 130 && bpm <= 150 && energy > 0.5 && spectralCentroid < 2500) return 'Trap';
    if (bpm >= 140 && energy > 0.6 && spectralCentroid > 3000) return 'Electronic';
    if (bpm >= 85 && bpm <= 115 && energy < 0.4 && spectralCentroid < 2000) return 'R&B';
    if (bpm >= 60 && bpm <= 100 && energy < 0.35 && danceability < 0.4) return 'Ambient';
    if (bpm >= 85 && bpm <= 115 && energy > 0.35 && spectralCentroid < 2500) return 'Hip-Hop';
    if (bpm >= 100 && bpm <= 130 && danceability > 0.6 && spectralCentroid > 2500) return 'Pop';
    if (bpm >= 115 && bpm <= 135 && danceability > 0.55 && energy > 0.45) return 'Funk';
    if (bpm >= 60 && bpm <= 90 && energy < 0.3 && scale === 'minor') return 'Jazz';
    if (bpm >= 90 && bpm <= 110 && energy > 0.3 && energy < 0.5 && scale === 'minor') return 'Soul';
    if (bpm >= 130 && energy > 0.7) return 'Electronic';
    if (bpm >= 60 && bpm <= 80 && danceability > 0.5) return 'Reggae';
    if (energy > 0.7 && spectralCentroid > 3500) return 'Rock';
    if (bpm >= 100 && bpm <= 130 && energy > 0.5) return 'Latin';
    if (energy > 0.4 && danceability > 0.5) return 'Pop';

    return 'Hip-Hop';
  }

  private inferMood(a: AudioAnalysisResult): string {
    const { energy, danceability, spectralCentroid, scale, bpm } = a;

    if (energy > 0.7 && danceability > 0.6) return 'Energetic';
    if (energy > 0.65 && danceability < 0.4) return 'Aggressive';
    if (energy < 0.25 && danceability < 0.35) return 'Chill';
    if (energy < 0.3 && scale === 'minor') return 'Melancholic';
    if (energy > 0.5 && danceability > 0.55 && scale === 'major') return 'Happy';
    if (energy < 0.35 && spectralCentroid < 1500) return 'Dark';
    if (energy > 0.4 && energy < 0.6 && spectralCentroid > 2500) return 'Uplifting';
    if (energy < 0.4 && spectralCentroid > 2000) return 'Romantic';
    if (energy > 0.5 && bpm > 120) return 'Confident';
    if (scale === 'minor' && energy > 0.4) return 'Mysterious';
    if (energy < 0.4 && danceability > 0.4) return 'Relaxed';
    if (spectralCentroid < 1800 && bpm < 100) return 'Nostalgic';

    return 'Modern';
  }

  private inferTags(a: AudioAnalysisResult, genre: string, mood: string): string[] {
    const tags: string[] = [];

    tags.push(genre.toLowerCase());
    tags.push(mood.toLowerCase());

    if (a.bpm >= 130) tags.push('fast');
    if (a.bpm <= 85) tags.push('slow');
    if (a.energy > 0.65) tags.push('hard');
    if (a.energy < 0.3) tags.push('soft');
    if (a.danceability > 0.6) tags.push('groovy');
    if (a.scale === 'minor') tags.push('minor key');
    if (a.scale === 'major') tags.push('major key');
    if (a.spectralCentroid > 3000) tags.push('bright');
    if (a.spectralCentroid < 1500) tags.push('deep');
    if (a.loudness > 20) tags.push('loud');

    if (genre === 'Trap') tags.push('808', 'hi-hats');
    if (genre === 'Hip-Hop') tags.push('boom bap', 'rap');
    if (genre === 'R&B') tags.push('smooth', 'vocals');
    if (genre === 'Electronic') tags.push('synth', 'bass');
    if (genre === 'Pop') tags.push('catchy', 'mainstream');

    const bpmRange = a.bpm >= 120 ? 'uptempo' : a.bpm >= 90 ? 'mid-tempo' : 'downtempo';
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
