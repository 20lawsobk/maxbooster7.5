import { db } from '../db.js';
import { logger } from '../logger.js';
import { storageService } from './storageService.js';
import wavefilePkg from 'wavefile';
const WaveFile = (wavefilePkg as any).WaveFile || wavefilePkg;

export interface WaveformData {
  peaks: number[];
  rms: number[];
  duration: number;
  sampleRate: number;
  channels: number;
  resolution: number;
}

export interface WaveformCacheEntry {
  audioKey: string;
  waveformData: WaveformData;
  createdAt: Date;
  expiresAt: Date;
}

const waveformCache = new Map<string, WaveformCacheEntry>();

class WaveformCacheService {
  private static instance: WaveformCacheService;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private readonly DEFAULT_RESOLUTION = 800;
  private readonly MAX_CACHE_SIZE = 1000;

  static getInstance(): WaveformCacheService {
    if (!WaveformCacheService.instance) {
      WaveformCacheService.instance = new WaveformCacheService();
    }
    return WaveformCacheService.instance;
  }

  async getWaveform(
    audioKey: string,
    audioBuffer?: Buffer,
    resolution: number = this.DEFAULT_RESOLUTION
  ): Promise<WaveformData> {
    const cacheKey = `${audioKey}:${resolution}`;
    const cached = waveformCache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      logger.debug('Waveform cache hit', { audioKey, resolution });
      return cached.waveformData;
    }

    logger.debug('Waveform cache miss, generating', { audioKey, resolution });

    let buffer = audioBuffer;
    if (!buffer) {
      try {
        buffer = await storageService.downloadFile(audioKey);
      } catch (error) {
        logger.error('Failed to download audio for waveform generation', { audioKey, error });
        throw new Error('Failed to retrieve audio file for waveform generation');
      }
    }

    const waveformData = await this.generateWaveform(buffer, resolution);
    
    this.cacheWaveform(cacheKey, audioKey, waveformData);
    
    return waveformData;
  }

  async generateWaveform(audioBuffer: Buffer, resolution: number = this.DEFAULT_RESOLUTION): Promise<WaveformData> {
    try {
      const wav = new WaveFile(audioBuffer);
      const samples = wav.getSamples();
      const sampleRate = wav.fmt.sampleRate;
      const channels = wav.fmt.numChannels;

      let leftChannel: Float32Array;
      let rightChannel: Float32Array | null = null;

      if (Array.isArray(samples)) {
        leftChannel = new Float32Array(samples[0]);
        if (samples.length > 1) {
          rightChannel = new Float32Array(samples[1]);
        }
      } else {
        leftChannel = new Float32Array(samples);
      }

      const samplesPerBucket = Math.floor(leftChannel.length / resolution);
      const peaks: number[] = [];
      const rms: number[] = [];

      for (let i = 0; i < resolution; i++) {
        const start = i * samplesPerBucket;
        const end = Math.min(start + samplesPerBucket, leftChannel.length);

        let maxPeak = 0;
        let sumSquares = 0;
        let count = 0;

        for (let j = start; j < end; j++) {
          const leftSample = Math.abs(leftChannel[j]);
          const rightSample = rightChannel ? Math.abs(rightChannel[j]) : leftSample;
          const sample = (leftSample + rightSample) / (rightChannel ? 2 : 1);

          if (sample > maxPeak) maxPeak = sample;
          sumSquares += sample * sample;
          count++;
        }

        peaks.push(maxPeak);
        rms.push(count > 0 ? Math.sqrt(sumSquares / count) : 0);
      }

      const duration = leftChannel.length / sampleRate;

      return {
        peaks,
        rms,
        duration,
        sampleRate,
        channels,
        resolution,
      };
    } catch (error) {
      logger.error('Error generating waveform from WAV', { error });
      return this.generateFallbackWaveform(resolution);
    }
  }

  async generateWaveformFromPCM(
    pcmData: Float32Array,
    sampleRate: number,
    channels: number,
    resolution: number = this.DEFAULT_RESOLUTION
  ): Promise<WaveformData> {
    const samplesPerChannel = Math.floor(pcmData.length / channels);
    const samplesPerBucket = Math.floor(samplesPerChannel / resolution);
    const peaks: number[] = [];
    const rms: number[] = [];

    for (let i = 0; i < resolution; i++) {
      const start = i * samplesPerBucket * channels;
      const end = Math.min(start + samplesPerBucket * channels, pcmData.length);

      let maxPeak = 0;
      let sumSquares = 0;
      let count = 0;

      for (let j = start; j < end; j += channels) {
        let sampleSum = 0;
        for (let c = 0; c < channels; c++) {
          sampleSum += Math.abs(pcmData[j + c] || 0);
        }
        const sample = sampleSum / channels;

        if (sample > maxPeak) maxPeak = sample;
        sumSquares += sample * sample;
        count++;
      }

      peaks.push(maxPeak);
      rms.push(count > 0 ? Math.sqrt(sumSquares / count) : 0);
    }

    const duration = samplesPerChannel / sampleRate;

    return {
      peaks,
      rms,
      duration,
      sampleRate,
      channels,
      resolution,
    };
  }

  private generateFallbackWaveform(resolution: number): WaveformData {
    const peaks = new Array(resolution).fill(0).map(() => Math.random() * 0.5 + 0.1);
    const rms = peaks.map(p => p * 0.7);

    return {
      peaks,
      rms,
      duration: 0,
      sampleRate: 44100,
      channels: 2,
      resolution,
    };
  }

  private cacheWaveform(cacheKey: string, audioKey: string, waveformData: WaveformData): void {
    if (waveformCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = waveformCache.keys().next().value;
      if (oldestKey) {
        waveformCache.delete(oldestKey);
      }
    }

    waveformCache.set(cacheKey, {
      audioKey,
      waveformData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.CACHE_TTL_MS),
    });
  }

  invalidateCache(audioKey: string): void {
    for (const [key] of waveformCache) {
      if (key.startsWith(audioKey)) {
        waveformCache.delete(key);
      }
    }
    logger.debug('Waveform cache invalidated', { audioKey });
  }

  clearExpiredCache(): number {
    const now = new Date();
    let cleared = 0;

    for (const [key, entry] of waveformCache) {
      if (entry.expiresAt < now) {
        waveformCache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info('Cleared expired waveform cache entries', { count: cleared });
    }

    return cleared;
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: waveformCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0,
    };
  }
}

export const waveformCacheService = WaveformCacheService.getInstance();
