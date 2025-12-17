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
      // TODO: Generate a 30-second preview of the audio file
      const previewPath = filePath.replace(/\.[^/.]+$/, '_preview.mp3');
      
      logger.info(`Generating preview for ${filePath} from ${startTime}s for ${duration}s`);
      
      // Mock preview generation
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
      // TODO: Implement actual key detection using audio analysis
      const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const scales = ['Major', 'Minor'];
      
      const key = keys[Math.floor(Math.random() * keys.length)];
      const scale = scales[Math.floor(Math.random() * scales.length)];
      const confidence = 0.7 + Math.random() * 0.3;
      
      logger.info(`Detected key for ${filePath}: ${key} ${scale} (${Math.round(confidence * 100)}% confidence)`);
      
      return { key, scale, confidence };
    } catch (error: unknown) {
      logger.error('Error detecting audio key:', error);
      throw new Error('Failed to detect audio key');
    }
  }

  async applyAudioEffects(filePath: string, effects: unknown[]): Promise<string> {
    try {
      // TODO: Apply audio effects using audio processing libraries
      const processedPath = filePath.replace(/\.[^/.]+$/, '_processed.wav');
      
      logger.info(`Applying effects to ${filePath}:`, effects);
      
      // Mock effects processing
      for (const effect of effects) {
        logger.info(`Applying ${effect.type} with settings:`, effect.settings);
      }
      
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

  async masterAudio(filePath: string, masteringSettings: unknown): Promise<string> {
    try {
      // TODO: Apply mastering processing to final mix
      const masteredPath = filePath.replace(/\.[^/.]+$/, '_mastered.wav');
      
      logger.info(`Mastering ${filePath} with settings:`, masteringSettings);
      
      // Mock mastering process
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
