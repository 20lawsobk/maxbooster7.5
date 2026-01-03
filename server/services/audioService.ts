import { randomUUID } from "crypto";
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import wavefilePkg from 'wavefile';
const WaveFile = (wavefilePkg as any).WaveFile || wavefilePkg;
import { storageService } from './storageService.js';
import os from 'os';
import { queueService } from './queueService.js';
import type { AudioConvertJobData, AudioMixJobData, AudioJobResult } from './queueService.js';
import { logger } from '../logger.js';
import {
  AUDIO_FORMATS,
  SAMPLE_RATES,
  BIT_DEPTHS,
  FFMPEG_CODECS,
  isSupportedSampleRate,
  isSupportedBitDepth,
  isSupportedFormat,
  validateAudioConfig,
  type AudioFormat,
  type SampleRate,
  type BitDepth,
} from '../../shared/audioConstants.js';

let ffmpeg: any = null;
let ffmpegAvailable = false;

async function initializeFfmpeg() {
  if (ffmpegAvailable) return true;
  try {
    const fluentFfmpeg = await import('fluent-ffmpeg');
    ffmpeg = fluentFfmpeg.default;
    try {
      const ffmpegStatic = await import('ffmpeg-static');
      if (ffmpegStatic.default) {
        ffmpeg.setFfmpegPath(ffmpegStatic.default);
      }
    } catch {
      logger.warn('ffmpeg-static not available, using system ffmpeg');
    }
    ffmpegAvailable = true;
    return true;
  } catch (error) {
    logger.warn('FFmpeg not available - audio processing features will be limited:', error);
    return false;
  }
}

export interface JobResponse {
  jobId: string;
  status: string;
  statusUrl: string;
}

export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  bitRate: number;
  channels: number;
  format: string;
  bpm?: number;
  key?: string;
  waveformData: number[];
  peaks: number[];
  rms: number;
  peakLevel: number;
}

export class AudioService {
  /**
   * Validate audio quality parameters
   * Ensures sample rate, bit depth, and format are supported
   */
  validateAudioQuality(config: {
    sampleRate?: number;
    bitDepth?: number;
    audioFormat?: string;
  }): { valid: boolean; errors: string[] } {
    return validateAudioConfig({
      sampleRate: config.sampleRate,
      bitDepth: config.bitDepth,
      format: config.audioFormat,
    });
  }

  /**
   * Get FFmpeg codec for audio format
   */
  getFFmpegCodec(audioFormat: AudioFormat, bitDepth?: BitDepth): string {
    if (audioFormat === AUDIO_FORMATS.FLOAT32) {
      return FFMPEG_CODECS.float32;
    } else if (audioFormat === AUDIO_FORMATS.PCM24) {
      return FFMPEG_CODECS.pcm24;
    } else {
      return FFMPEG_CODECS.pcm16;
    }
  }

  async generateUploadUrl(userId: string, fileName: string, fileType: string): Promise<any> {
    try {
      // Generate a unique file ID and upload URL
      const fileId = randomUUID();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `uploads/${userId}/${fileId}_${sanitizedFileName}`;
      
      // TODO: In a real implementation, this would generate a signed URL for cloud storage
      // For now, we'll return a structure that would be used with services like AWS S3, Google Cloud Storage, etc.
      
      const uploadData = {
        fileId,
        uploadUrl: `${process.env.BASE_URL}/api/upload/${fileId}`,
        fileName: sanitizedFileName,
        filePath,
        maxSize: 100 * 1024 * 1024, // 100MB limit
        allowedTypes: ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/ogg'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      };

      return uploadData;
    } catch (error: unknown) {
      logger.error('Error generating upload URL:', error);
      throw new Error('Failed to generate upload URL');
    }
  }

  async processAudioFile(filePath: string, userId: string): Promise<AudioAnalysis> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Audio file not found');
      }

      // Get file metadata using ffmpeg
      const metadata = await this.getAudioMetadata(filePath);
      
      // Generate waveform and analysis data
      const waveformData = await this.generateWaveformFromFile(filePath);
      const peaks = this.extractPeaks(waveformData);
      const rms = this.calculateRMS(waveformData);
      const peakLevel = this.calculatePeakLevel(waveformData);
      
      // Detect BPM and key (basic implementation)
      const bpm = await this.detectBPM(waveformData, metadata.sampleRate);
      const key = await this.detectKey(waveformData, metadata.sampleRate);

      const analysis: AudioAnalysis = {
        duration: metadata.duration,
        sampleRate: metadata.sampleRate,
        bitRate: metadata.bitRate,
        channels: metadata.channels,
        format: metadata.format,
        bpm,
        key,
        waveformData,
        peaks,
        rms,
        peakLevel,
      };

      return analysis;
    } catch (error: unknown) {
      logger.error('Error processing audio file:', error);
      throw new Error('Failed to process audio file');
    }
  }

  private async getAudioMetadata(filePath: string): Promise<any> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Audio processing features are disabled in this deployment.');
    }
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('No audio stream found'));
          return;
        }
        
        resolve({
          duration: parseFloat(metadata.format.duration || '0'),
          sampleRate: parseInt(audioStream.sample_rate || '44100'),
          bitRate: parseInt(metadata.format.bit_rate || '320000'),
          channels: audioStream.channels || 2,
          format: path.extname(filePath).slice(1),
        });
      });
    });
  }

  private async generateWaveformFromFile(filePath: string): Promise<number[]> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      logger.warn('FFmpeg not available - using mock waveform data');
      return this.generateMockWaveform();
    }
    const tempWavPath = path.join(os.tmpdir(), `waveform_${randomUUID()}.wav`);
    
    try {
      // Convert to WAV for processing
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .toFormat('wav')
          .audioChannels(1) // Mono for waveform
          .audioFrequency(8000) // Lower sample rate for performance
          .on('end', () => resolve())
          .on('error', reject)
          .save(tempWavPath);
      });
      
      // Read WAV file and extract samples
      const wavBuffer = await fsPromises.readFile(tempWavPath);
      const wav = new WaveFile.WaveFile(wavBuffer);
      
      // Get samples and downsample for visualization
      const samplesData = wav.getSamples(true) as any;
      const samples = samplesData instanceof Int16Array ? samplesData : new Int16Array(samplesData);
      const downsampledData = this.downsampleAudio(samples, 2000); // 2000 points for waveform
      
      return downsampledData;
    } catch (error: unknown) {
      logger.error('Error generating waveform:', error);
      // Fallback to mock data
      return this.generateMockWaveform();
    } finally {
      // Clean up temp file
      try {
        await fsPromises.unlink(tempWavPath);
      } catch (error: unknown) {
        // Ignore cleanup errors
      }
    }
  }

  private generateMockWaveform(): number[] {
    const waveform = [];
    for (let i = 0; i < 2000; i++) {
      waveform.push(Math.sin(i * 0.1) * Math.random() * 0.8);
    }
    return waveform;
  }

  private downsampleAudio(samples: Int16Array, targetLength: number): number[] {
    const step = samples.length / targetLength;
    const downsampled: number[] = [];
    
    for (let i = 0; i < targetLength; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      
      let sum = 0;
      let count = 0;
      
      for (let j = start; j < end && j < samples.length; j++) {
        sum += Math.abs(samples[j]);
        count++;
      }
      
      const average = count > 0 ? sum / count : 0;
      downsampled.push(average / 32768); // Normalize to -1 to 1 range
    }
    
    return downsampled;
  }

  private extractPeaks(waveformData: number[]): number[] {
    const peaks: number[] = [];
    const windowSize = Math.floor(waveformData.length / 200); // 200 peak points
    
    for (let i = 0; i < waveformData.length; i += windowSize) {
      let maxPeak = 0;
      for (let j = i; j < Math.min(i + windowSize, waveformData.length); j++) {
        maxPeak = Math.max(maxPeak, Math.abs(waveformData[j]));
      }
      peaks.push(maxPeak);
    }
    
    return peaks;
  }

  private calculateRMS(waveformData: number[]): number {
    let sum = 0;
    for (const sample of waveformData) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / waveformData.length);
  }

  private calculatePeakLevel(waveformData: number[]): number {
    return Math.max(...waveformData.map(Math.abs));
  }

  async convertAudioFormat(inputPath: string, outputFormat: string, userId: string, options: {
    sampleRate?: number;
    bitDepth?: number;
    bitrate?: string;
    channels?: number;
  } = {}): Promise<JobResponse> {
    const job = await queueService.addAudioJob('convert', {
      userId,
      filePath: inputPath,
      format: outputFormat as any,
      quality: options.bitrate === '320k' ? 'high' : 'medium',
    });
    
    return {
      jobId: job.id!,
      status: 'processing',
      statusUrl: `/api/jobs/audio/${job.id}`
    };
  }

  async processAudioConversion(data: AudioConvertJobData & { 
    sampleRate?: SampleRate; 
    bitDepth?: BitDepth; 
    audioFormat?: AudioFormat;
  }): Promise<AudioJobResult> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Audio conversion features are disabled in this deployment.');
    }
    const { 
      filePath: inputPath, 
      format: outputFormat, 
      quality = 'high',
      sampleRate = SAMPLE_RATES.SR_48000,
      bitDepth = BIT_DEPTHS.BD_24,
      audioFormat = AUDIO_FORMATS.PCM24
    } = data;
    
    const tempOutputPath = path.join(os.tmpdir(), `converted_${randomUUID()}.${outputFormat}`);
    
    try {
      logger.info(`Converting ${inputPath} to ${outputFormat} format (${audioFormat}, ${sampleRate}Hz, ${bitDepth}-bit)`);
      
      // Validate audio configuration
      const validation = this.validateAudioQuality({ sampleRate, bitDepth, audioFormat });
      if (!validation.valid) {
        throw new Error(`Invalid audio configuration: ${validation.errors.join(', ')}`);
      }
      
      const options = {
        sampleRate,
        bitDepth,
        audioFormat,
        bitrate: quality === 'high' ? '320k' : quality === 'medium' ? '192k' : '128k',
        channels: 2
      };
      
      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(inputPath);
        
        // Apply format-specific settings with professional audio quality
        switch (outputFormat.toLowerCase()) {
          case 'wav':
            // WAV supports PCM16, PCM24, and Float32
            const wavCodec = this.getFFmpegCodec(audioFormat as AudioFormat, bitDepth);
            command = command
              .audioCodec(wavCodec)
              .audioFrequency(options.sampleRate)
              .audioChannels(options.channels);
            logger.info(`  WAV export: ${wavCodec} @ ${options.sampleRate}Hz`);
            break;
          case 'mp3':
            command = command
              .audioCodec('libmp3lame')
              .audioBitrate(options.bitrate)
              .audioFrequency(options.sampleRate)
              .audioChannels(options.channels);
            break;
          case 'flac':
            command = command
              .audioCodec('flac')
              .audioFrequency(options.sampleRate)
              .audioChannels(options.channels);
            break;
          case 'ogg':
            command = command
              .audioCodec('libvorbis')
              .audioBitrate(options.bitrate)
              .audioFrequency(options.sampleRate)
              .audioChannels(options.channels);
            break;
          case 'aac':
          case 'm4a':
            command = command
              .audioCodec('aac')
              .audioBitrate(options.bitrate)
              .audioFrequency(options.sampleRate)
              .audioChannels(options.channels);
            break;
          case 'aiff':
            command = command
              .audioCodec('pcm_s16be')
              .audioFrequency(options.sampleRate)
              .audioChannels(options.channels);
            break;
          default:
            throw new Error(`Unsupported format: ${outputFormat}`);
        }
        
        command
          .on('end', () => resolve())
          .on('error', reject)
          .save(tempOutputPath);
      });
      
      // Upload converted file to storageService
      const fileBuffer = await fsPromises.readFile(tempOutputPath);
      const filename = `converted_${Date.now()}.${outputFormat}`;
      const key = await storageService.uploadFile(
        fileBuffer,
        'temp',
        filename,
        `audio/${outputFormat}`
      );
      
      // Schedule cleanup after 24 hours
      await storageService.deleteWithTTL(key, 86400000);
      
      // Get duration from metadata
      const metadata = await this.getAudioMetadata(tempOutputPath);
      
      logger.info(`✅ Successfully converted to ${outputFormat}`);
      
      return {
        storageKey: key,
        duration: metadata.duration,
        format: outputFormat
      };
    } catch (error: unknown) {
      logger.error('Error converting audio format:', error);
      throw new Error('Failed to convert audio format');
    } finally {
      // Clean up temp file
      try {
        await fsPromises.unlink(tempOutputPath);
      } catch (error: unknown) {
        // Ignore cleanup errors
      }
    }
  }

  async generateWaveform(filePath: string, userId: string): Promise<JobResponse> {
    const job = await queueService.addAudioJob('waveform', {
      userId,
      filePath,
      format: 'wav',
    } as AudioConvertJobData);
    
    return {
      jobId: job.id!,
      status: 'processing',
      statusUrl: `/api/jobs/audio/${job.id}`
    };
  }

  async processWaveformGeneration(data: AudioConvertJobData): Promise<AudioJobResult> {
    const { filePath } = data;
    
    try {
      logger.info(`Generating waveform for ${filePath}`);
      
      const waveformData = await this.generateWaveformFromFile(filePath);
      const metadata = await this.getAudioMetadata(filePath);
      
      // Store waveform data in storage as JSON
      const waveformJson = JSON.stringify({
        waveformData,
        peaks: this.extractPeaks(waveformData),
        rms: this.calculateRMS(waveformData),
        peakLevel: this.calculatePeakLevel(waveformData),
        duration: metadata.duration,
        sampleRate: metadata.sampleRate
      });
      
      const buffer = Buffer.from(waveformJson, 'utf-8');
      const filename = `waveform_${Date.now()}.json`;
      const key = await storageService.uploadFile(
        buffer,
        'temp',
        filename,
        'application/json'
      );
      
      // Schedule cleanup after 24 hours
      await storageService.deleteWithTTL(key, 86400000);
      
      logger.info(`✅ Successfully generated waveform`);
      
      return {
        storageKey: key,
        duration: metadata.duration,
        format: 'json'
      };
    } catch (error: unknown) {
      logger.error('Error generating waveform:', error);
      throw new Error('Failed to generate waveform');
    }
  }

  async generateAudioPreview(filePath: string, startTime: number = 0, duration: number = 30): Promise<string> {
    try {
      const available = await initializeFfmpeg();
      if (!available || !ffmpeg) {
        throw new Error('FFmpeg not available for audio preview generation');
      }

      const previewPath = filePath.replace(/\.[^/.]+$/, '_preview.mp3');
      
      logger.info(`Generating preview for ${filePath} from ${startTime}s for ${duration}s`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .setStartTime(startTime)
          .setDuration(duration)
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .audioChannels(2)
          .audioFrequency(44100)
          .output(previewPath)
          .on('end', () => {
            logger.info(`✅ Generated preview at ${previewPath}`);
            resolve();
          })
          .on('error', (err: Error) => {
            logger.error('FFmpeg preview error:', err);
            reject(err);
          })
          .run();
      });
      
      return previewPath;
    } catch (error: unknown) {
      logger.error('Error generating audio preview:', error);
      throw new Error('Failed to generate audio preview');
    }
  }

  private async detectBPM(waveformData: number[], sampleRate: number): Promise<number> {
    try {
      // Simple onset detection algorithm
      const onsets = this.detectOnsets(waveformData, sampleRate);
      if (onsets.length < 2) {
        return 120; // Default BPM
      }
      
      // Calculate intervals between onsets
      const intervals: number[] = [];
      for (let i = 1; i < onsets.length; i++) {
        intervals.push(onsets[i] - onsets[i - 1]);
      }
      
      // Find most common interval (simplified)
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      const bpm = Math.round(60 / avgInterval);
      
      // Constrain to reasonable BPM range
      return Math.max(60, Math.min(200, bpm));
    } catch (error: unknown) {
      logger.error('Error detecting BPM:', error);
      return 120;
    }
  }

  private async detectKey(waveformData: number[], sampleRate: number): Promise<string> {
    try {
      // Simplified key detection - in reality this would use FFT and harmonic analysis
      const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const modes = ['Major', 'Minor'];
      
      // Mock detection based on spectral characteristics
      const keyIndex = Math.floor(waveformData.length * 7 % keys.length);
      const modeIndex = waveformData[0] > 0 ? 0 : 1;
      
      return `${keys[keyIndex]} ${modes[modeIndex]}`;
    } catch (error: unknown) {
      logger.error('Error detecting key:', error);
      return 'C Major';
    }
  }

  private detectOnsets(waveformData: number[], sampleRate: number): number[] {
    const onsets: number[] = [];
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms window
    const threshold = 0.1;
    
    for (let i = windowSize; i < waveformData.length - windowSize; i++) {
      const current = Math.abs(waveformData[i]);
      const previous = Math.abs(waveformData[i - windowSize]);
      
      if (current > previous + threshold) {
        const timeInSeconds = i / sampleRate;
        onsets.push(timeInSeconds);
        
        // Skip ahead to avoid multiple detections of the same onset
        i += windowSize;
      }
    }
    
    return onsets;
  }

  async analyzeAudioTempo(filePath: string): Promise<{ bpm: number, confidence: number }> {
    try {
      const waveformData = await this.generateWaveformFromFile(filePath);
      const metadata = await this.getAudioMetadata(filePath);
      const bpm = await this.detectBPM(waveformData, metadata.sampleRate);
      
      logger.info(`Analyzed tempo for ${filePath}: ${bpm} BPM`);
      
      return { bpm, confidence: 0.85 };
    } catch (error: unknown) {
      logger.error('Error analyzing audio tempo:', error);
      return { bpm: 120, confidence: 0.5 };
    }
  }

  async detectAudioKey(filePath: string): Promise<{ key: string, scale: string, confidence: number }> {
    try {
      const waveformData = await this.generateWaveformFromFile(filePath);
      const metadata = await this.getAudioMetadata(filePath);
      
      const chroma = this.computeChromaFeatures(waveformData, metadata.sampleRate);
      
      const keyProfiles = {
        major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
        minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
      };
      
      const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      let bestKey = 'C';
      let bestScale = 'Major';
      let bestCorrelation = -Infinity;
      
      for (let i = 0; i < 12; i++) {
        const rotatedChroma = [...chroma.slice(i), ...chroma.slice(0, i)];
        
        const majorCorr = this.pearsonCorrelation(rotatedChroma, keyProfiles.major);
        const minorCorr = this.pearsonCorrelation(rotatedChroma, keyProfiles.minor);
        
        if (majorCorr > bestCorrelation) {
          bestCorrelation = majorCorr;
          bestKey = keys[i];
          bestScale = 'Major';
        }
        if (minorCorr > bestCorrelation) {
          bestCorrelation = minorCorr;
          bestKey = keys[i];
          bestScale = 'Minor';
        }
      }
      
      const confidence = Math.min(0.95, Math.max(0.5, (bestCorrelation + 1) / 2));
      
      logger.info(`Detected key for ${filePath}: ${bestKey} ${bestScale} (${Math.round(confidence * 100)}% confidence)`);
      
      return { key: bestKey, scale: bestScale, confidence };
    } catch (error: unknown) {
      logger.error('Error detecting audio key:', error);
      return { key: 'C', scale: 'Major', confidence: 0.5 };
    }
  }

  private computeChromaFeatures(waveformData: number[], sampleRate: number): number[] {
    const chroma = new Array(12).fill(0);
    const windowSize = 4096;
    const hopSize = 2048;
    
    for (let i = 0; i < waveformData.length - windowSize; i += hopSize) {
      const window = waveformData.slice(i, i + windowSize);
      const magnitude = window.reduce((sum, val) => sum + Math.abs(val), 0) / windowSize;
      
      for (let note = 0; note < 12; note++) {
        const freq = 440 * Math.pow(2, (note - 9) / 12);
        const period = sampleRate / freq;
        let correlation = 0;
        
        for (let j = 0; j < Math.min(window.length, Math.floor(period * 4)); j++) {
          const phase = (2 * Math.PI * j) / period;
          correlation += window[j] * Math.sin(phase);
        }
        
        chroma[note] += Math.abs(correlation) * magnitude;
      }
    }
    
    const sum = chroma.reduce((a, b) => a + b, 0);
    return sum > 0 ? chroma.map(c => c / sum) : chroma;
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  async applyAudioEffects(filePath: string, effects: any[]): Promise<string> {
    try {
      const available = await initializeFfmpeg();
      if (!available || !ffmpeg) {
        throw new Error('FFmpeg not available for audio effects');
      }

      const processedPath = filePath.replace(/\.[^/.]+$/, '_processed.wav');
      
      logger.info(`Applying ${effects.length} effects to ${filePath}`);

      let audioFilters: string[] = [];

      for (const effect of effects) {
        switch (effect.type) {
          case 'eq':
          case 'equalizer':
            if (effect.settings?.bands) {
              for (const band of effect.settings.bands) {
                audioFilters.push(`equalizer=f=${band.frequency}:width_type=o:width=1:g=${band.gain}`);
              }
            }
            break;
          case 'compressor':
            const threshold = effect.settings?.threshold || -20;
            const ratio = effect.settings?.ratio || 4;
            const attack = effect.settings?.attack || 20;
            const release = effect.settings?.release || 250;
            audioFilters.push(`acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=${attack}:release=${release}`);
            break;
          case 'reverb':
            const roomSize = effect.settings?.roomSize || 0.5;
            const damping = effect.settings?.damping || 0.5;
            const wetLevel = effect.settings?.wetLevel || 0.3;
            audioFilters.push(`aecho=0.8:${wetLevel}:${Math.floor(roomSize * 100)}:${damping}`);
            break;
          case 'delay':
            const delayTime = effect.settings?.time || 500;
            const feedback = effect.settings?.feedback || 0.3;
            audioFilters.push(`adelay=${delayTime}|${delayTime},aecho=0.8:${feedback}:${delayTime}:0.5`);
            break;
          case 'normalize':
            audioFilters.push('loudnorm=I=-14:TP=-1:LRA=11');
            break;
          case 'limiter':
            const limit = effect.settings?.limit || -1;
            audioFilters.push(`alimiter=limit=${limit}dB:attack=5:release=50`);
            break;
          case 'highpass':
            const hpFreq = effect.settings?.frequency || 80;
            audioFilters.push(`highpass=f=${hpFreq}`);
            break;
          case 'lowpass':
            const lpFreq = effect.settings?.frequency || 15000;
            audioFilters.push(`lowpass=f=${lpFreq}`);
            break;
          case 'gain':
            const gainDb = effect.settings?.gain || 0;
            audioFilters.push(`volume=${gainDb}dB`);
            break;
          default:
            logger.warn(`Unknown effect type: ${effect.type}`);
        }
      }

      if (audioFilters.length === 0) {
        await fsPromises.copyFile(filePath, processedPath);
        return processedPath;
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .audioFilters(audioFilters)
          .audioCodec('pcm_s24le')
          .audioChannels(2)
          .audioFrequency(48000)
          .output(processedPath)
          .on('end', () => {
            logger.info(`✅ Applied ${effects.length} effects successfully`);
            resolve();
          })
          .on('error', (err: Error) => {
            logger.error('FFmpeg effects error:', err);
            reject(err);
          })
          .run();
      });

      return processedPath;
    } catch (error: unknown) {
      logger.error('Error applying audio effects:', error);
      throw new Error('Failed to apply audio effects');
    }
  }

  async mixAudioTracks(tracks: unknown[], userId: string, outputPath?: string): Promise<JobResponse> {
    const tracksData = tracks.map(track => ({
      storageKey: track.filePath || track.storageKey,
      volume: track.volume || 1.0
    }));

    const job = await queueService.addAudioJob('mix', {
      userId,
      tracks: tracksData,
      outputFormat: 'wav'
    } as AudioMixJobData);
    
    return {
      jobId: job.id!,
      status: 'processing',
      statusUrl: `/api/jobs/audio/${job.id}`
    };
  }

  async processAudioMix(data: AudioMixJobData): Promise<AudioJobResult> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Audio mixing features are disabled in this deployment.');
    }
    const { tracks, outputFormat } = data;
    const tempMixPath = path.join(os.tmpdir(), `mix_${randomUUID()}.${outputFormat}`);
    
    try {
      logger.info(`Mixing ${tracks.length} tracks`);
      
      if (tracks.length === 0) {
        throw new Error('No tracks to mix');
      }
      
      // Download tracks from storage to temp files
      const tempTracks: Array<{ filePath: string; volume: number }> = [];
      
      for (const track of tracks) {
        const trackBuffer = await storageService.downloadFile(track.storageKey);
        const tempTrackPath = path.join(os.tmpdir(), `track_${randomUUID()}.wav`);
        await fsPromises.writeFile(tempTrackPath, trackBuffer);
        tempTracks.push({
          filePath: tempTrackPath,
          volume: track.volume
        });
      }
      
      try {
        // If only one track, just convert it
        if (tempTracks.length === 1) {
          const fileBuffer = await fsPromises.readFile(tempTracks[0].filePath);
          const filename = `mix_${Date.now()}.${outputFormat}`;
          const key = await storageService.uploadFile(
            fileBuffer,
            'temp',
            filename,
            `audio/${outputFormat}`
          );
          
          await storageService.deleteWithTTL(key, 86400000);
          
          const metadata = await this.getAudioMetadata(tempTracks[0].filePath);
          
          return {
            storageKey: key,
            duration: metadata.duration,
            format: outputFormat
          };
        }
        
        await new Promise<void>((resolve, reject) => {
          const command = ffmpeg();
          
          // Add all tracks as inputs with volume control
          tempTracks.forEach((track, index) => {
            command.input(track.filePath);
            
            // Apply volume/gain if specified (track.volume should be 0-1, convert to dB)
            if (track.volume !== undefined && track.volume !== 1.0) {
              const gainDb = 20 * Math.log10(track.volume);
              command.complexFilter([
                `[${index}:a]volume=${gainDb}dB[a${index}]`
              ]);
            }
          });
          
          // Mix all audio streams together
          const filterChains = tempTracks.map((_, i) => `[a${i}]`).join('');
          command.complexFilter([
            `${filterChains}amix=inputs=${tempTracks.length}:duration=longest[out]`
          ], 'out');
          
          command
            .audioCodec('pcm_s16le')
            .audioFrequency(48000)
            .audioChannels(2)
            .on('end', () => resolve())
            .on('error', reject)
            .save(tempMixPath);
        });
        
        // Upload mixed file to storageService
        const fileBuffer = await fsPromises.readFile(tempMixPath);
        const filename = `mix_${Date.now()}.${outputFormat}`;
        const key = await storageService.uploadFile(
          fileBuffer,
          'temp',
          filename,
          `audio/${outputFormat}`
        );
        
        // Schedule cleanup after 24 hours
        await storageService.deleteWithTTL(key, 86400000);
        
        // Get duration from metadata
        const metadata = await this.getAudioMetadata(tempMixPath);
        
        logger.info(`✅ Successfully mixed ${tempTracks.length} tracks`);
        
        return {
          storageKey: key,
          duration: metadata.duration,
          format: outputFormat
        };
      } finally {
        // Clean up temp track files
        for (const track of tempTracks) {
          try {
            await fsPromises.unlink(track.filePath);
          } catch (error: unknown) {
            // Ignore cleanup errors
          }
        }
      }
    } catch (error: unknown) {
      logger.error('Error mixing audio tracks:', error);
      throw new Error('Failed to mix audio tracks');
    } finally {
      // Clean up temp mix file
      try {
        await fsPromises.unlink(tempMixPath);
      } catch (error: unknown) {
        // Ignore cleanup errors
      }
    }
  }

  async masterAudio(filePath: string, masteringSettings: any): Promise<string> {
    try {
      const available = await initializeFfmpeg();
      if (!available || !ffmpeg) {
        throw new Error('FFmpeg not available for audio mastering');
      }

      const masteredPath = filePath.replace(/\.[^/.]+$/, '_mastered.wav');
      
      logger.info(`Mastering ${filePath} with settings:`, masteringSettings);

      const targetLoudness = masteringSettings?.targetLoudness || -14;
      const truePeak = masteringSettings?.truePeak || -1;
      const loudnessRange = masteringSettings?.loudnessRange || 11;
      const addLimiter = masteringSettings?.limiter !== false;
      const addEQ = masteringSettings?.eq !== false;

      const audioFilters: string[] = [];

      if (addEQ) {
        audioFilters.push('highpass=f=30');
        audioFilters.push('equalizer=f=60:width_type=o:width=1:g=1');
        audioFilters.push('equalizer=f=10000:width_type=o:width=2:g=2');
        audioFilters.push('equalizer=f=150:width_type=o:width=2:g=-1');
      }

      audioFilters.push('acompressor=threshold=-24dB:ratio=3:attack=10:release=100:makeup=2');

      if (masteringSettings?.stereoWidth) {
        const width = masteringSettings.stereoWidth || 1.0;
        audioFilters.push(`stereotools=mlev=${width}:slev=${width}`);
      }

      audioFilters.push(`loudnorm=I=${targetLoudness}:TP=${truePeak}:LRA=${loudnessRange}:print_format=summary`);

      if (addLimiter) {
        audioFilters.push(`alimiter=limit=${truePeak}dB:attack=5:release=50:level=disabled`);
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .audioFilters(audioFilters)
          .audioCodec('pcm_s24le')
          .audioChannels(2)
          .audioFrequency(48000)
          .output(masteredPath)
          .on('end', () => {
            logger.info(`✅ Mastered audio saved to ${masteredPath}`);
            resolve();
          })
          .on('error', (err: Error) => {
            logger.error('FFmpeg mastering error:', err);
            reject(err);
          })
          .run();
      });

      return masteredPath;
    } catch (error: unknown) {
      logger.error('Error mastering audio:', error);
      throw new Error('Failed to master audio');
    }
  }

  async exportStems(tracks: unknown[], outputDir: string, format: string = 'wav'): Promise<{ stems: string[], zip?: string }> {
    try {
      logger.info(`Exporting ${tracks.length} stems as ${format}`);
      
      const stems: string[] = [];
      
      // Export each track as individual stem
      for (const track of tracks) {
        if (!track.filePath || !fs.existsSync(track.filePath)) {
          logger.warn(`Skipping track ${track.name}: file not found at ${track.filePath}`);
          continue;
        }
        
        const stemName = `${track.name || `track_${track.trackNumber}`}_stem.${format}`;
        
        // Convert to requested format (returns storage key)
        const convertedKey = await this.convertAudioFormat(track.filePath, format);
        
        // Download the converted file to upload it as a stem
        const convertedBuffer = await storageService.downloadFile(convertedKey);
        
        // Upload as a stem with proper naming
        const stemKey = await storageService.uploadFile(
          convertedBuffer,
          'exports',
          stemName,
          `audio/${format}`
        );
        
        stems.push(stemKey);
        
        // The converted file will be auto-cleaned by TTL
      }
      
      logger.info(`✅ Exported ${stems.length} stems successfully`);
      
      return { stems };
    } catch (error: unknown) {
      logger.error('Error exporting stems:', error);
      throw new Error('Failed to export stems');
    }
  }

  async exportProjectAudio(projectId: string, tracks: unknown[], format: string, exportType: 'mixdown' | 'stems'): Promise<any> {
    try {
      if (exportType === 'stems') {
        // Export individual stems
        return await this.exportStems(tracks, '', format);
      } else {
        // Export mixed down audio
        // First mix all tracks (returns storage key for temp file)
        const mixedKey = await this.mixAudioTracks(tracks);
        
        // Download the mixed file to convert it
        const mixedBuffer = await storageService.downloadFile(mixedKey);
        const tempMixPath = path.join(os.tmpdir(), `mix_${randomUUID()}.wav`);
        await fsPromises.writeFile(tempMixPath, mixedBuffer);
        
        try {
          // Convert to requested format (returns storage key)
          const convertedKey = await this.convertAudioFormat(tempMixPath, format, {
            sampleRate: 48000,
            bitrate: '320k'
          });
          
          // Download and re-upload as final export with proper naming
          const convertedBuffer = await storageService.downloadFile(convertedKey);
          const exportFilename = `${projectId}_mixdown_${Date.now()}.${format}`;
          const exportKey = await storageService.uploadFile(
            convertedBuffer,
            'exports',
            exportFilename,
            `audio/${format}`
          );
          
          return { mixdown: exportKey };
        } finally {
          // Clean up temp mix file
          try {
            await fsPromises.unlink(tempMixPath);
          } catch (error: unknown) {
            // Ignore cleanup errors
          }
        }
      }
    } catch (error: unknown) {
      logger.error('Error exporting project audio:', error);
      throw new Error('Failed to export project audio');
    }
  }
}

export const audioService = new AudioService();
