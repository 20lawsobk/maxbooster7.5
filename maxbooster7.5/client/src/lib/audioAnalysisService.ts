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
}

export const audioAnalysisService = new AudioAnalysisService();
