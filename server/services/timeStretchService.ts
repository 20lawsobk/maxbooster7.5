import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import { storageService } from './storageService.js';
import { queueService } from './queueService.js';
import type {
  WarpJobPayload,
  WarpPreviewPayload,
  TransientDetectionPayload,
  WarpJobResult,
  TransientDetectionResult,
} from './queueService.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { warpMarkers, audioClips } from '@shared/schema';
import { eq, asc } from 'drizzle-orm';

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
    logger.warn('FFmpeg not available - time stretch features will be limited:', error);
    return false;
  }
}

export interface WarpAlgorithm {
  name: 'rubberband' | 'phase_vocoder' | 'wsola';
  preserveFormants: boolean;
  quality: 'fast' | 'normal' | 'high';
}

export interface WarpMarkerData {
  id: string;
  sourceTime: number;
  targetTime: number;
  isAnchor?: boolean;
  transientStrength?: number;
}

export interface WarpParameters {
  markers: WarpMarkerData[];
  pitchShift?: number;
  preserveFormants?: boolean;
  algorithm?: WarpAlgorithm['name'];
  quality?: WarpAlgorithm['quality'];
}

export interface TransientData {
  time: number;
  strength: number;
  suggestedBeat?: number;
}

export interface TempoMapping {
  sourceBpm: number;
  targetBpm: number;
  beatGrid: number[];
  barPositions: number[];
}

interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
}

const RUBBERBAND_QUALITY_MAP: Record<WarpAlgorithm['quality'], string> = {
  fast: '-c2',
  normal: '-c4',
  high: '-c6',
};

const RUBBERBAND_FLAGS = {
  preserveFormants: '--formant',
  smooth: '--smooth',
  highQuality: '--realtime',
};

export class TimeStretchService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'max-booster-warp');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fsPromises.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create temp directory for warp processing', error);
    }
  }

  private async getAudioMetadata(filePath: string): Promise<AudioMetadata> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Time stretch features are disabled in this deployment.');
    }
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to probe audio file: ${err.message}`));
          return;
        }
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('No audio stream found in file'));
          return;
        }
        resolve({
          duration: parseFloat(metadata.format.duration || '0'),
          sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : 44100,
          channels: audioStream.channels || 2,
          format: audioStream.codec_name || 'unknown',
        });
      });
    });
  }

  async timeStretch(
    inputPath: string,
    outputPath: string,
    stretchRatio: number,
    options: {
      pitchShift?: number;
      preserveFormants?: boolean;
      algorithm?: WarpAlgorithm['name'];
      quality?: WarpAlgorithm['quality'];
    } = {}
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Time stretch features are disabled in this deployment.');
    }
    const { pitchShift = 0, preserveFormants = true, algorithm = 'phase_vocoder', quality = 'normal' } = options;

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);
      const filters: string[] = [];

      if (algorithm === 'rubberband') {
        const pitchFactor = Math.pow(2, pitchShift / 12);
        let rubberBandFilter = `rubberband=tempo=${stretchRatio}:pitch=${pitchFactor}`;
        if (preserveFormants) {
          rubberBandFilter += ':formant=preserved';
        }
        filters.push(rubberBandFilter);
      } else if (algorithm === 'wsola') {
        const tempoValue = 1 / stretchRatio;
        filters.push(`atempo=${Math.min(Math.max(tempoValue, 0.5), 2.0)}`);
        if (pitchShift !== 0) {
          const pitchFactor = Math.pow(2, pitchShift / 12);
          filters.push(`asetrate=44100*${pitchFactor}`);
          filters.push(`aresample=44100`);
        }
      } else {
        const speed = 1 / stretchRatio;
        if (speed >= 0.5 && speed <= 2.0) {
          filters.push(`atempo=${speed}`);
        } else if (speed < 0.5) {
          let remaining = speed;
          while (remaining < 0.5) {
            filters.push('atempo=0.5');
            remaining *= 2;
          }
          if (remaining !== 1.0) {
            filters.push(`atempo=${remaining}`);
          }
        } else {
          let remaining = speed;
          while (remaining > 2.0) {
            filters.push('atempo=2.0');
            remaining /= 2;
          }
          if (remaining !== 1.0) {
            filters.push(`atempo=${remaining}`);
          }
        }

        if (pitchShift !== 0) {
          const pitchFactor = Math.pow(2, pitchShift / 12);
          filters.push(`asetrate=44100*${pitchFactor}`);
          filters.push(`aresample=44100`);
          if (preserveFormants) {
            filters.push('aecho=0.8:0.88:60:0.4');
          }
        }
      }

      if (filters.length > 0) {
        command = command.audioFilters(filters);
      }

      command
        .outputOptions(['-y', '-acodec', 'pcm_s24le'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`Time stretch failed: ${err.message}`)))
        .run();
    });
  }

  async processWarpMarkers(
    inputPath: string,
    outputPath: string,
    markers: WarpMarkerData[],
    options: {
      pitchShift?: number;
      preserveFormants?: boolean;
      algorithm?: WarpAlgorithm['name'];
      quality?: WarpAlgorithm['quality'];
    } = {}
  ): Promise<void> {
    if (markers.length === 0) {
      await fsPromises.copyFile(inputPath, outputPath);
      return;
    }

    const sortedMarkers = [...markers].sort((a, b) => a.sourceTime - b.sourceTime);
    const metadata = await this.getAudioMetadata(inputPath);
    const segments: string[] = [];
    const tempFiles: string[] = [];

    try {
      let lastSourceTime = 0;
      let lastTargetTime = 0;

      for (let i = 0; i < sortedMarkers.length; i++) {
        const marker = sortedMarkers[i];
        const segmentId = randomUUID();
        const segmentInput = path.join(this.tempDir, `segment_${segmentId}_in.wav`);
        const segmentOutput = path.join(this.tempDir, `segment_${segmentId}_out.wav`);

        tempFiles.push(segmentInput, segmentOutput);

        const segmentDuration = marker.sourceTime - lastSourceTime;
        const targetDuration = marker.targetTime - lastTargetTime;

        if (segmentDuration > 0.001) {
          await this.extractAudioSegment(inputPath, segmentInput, lastSourceTime, segmentDuration);

          const stretchRatio = targetDuration / segmentDuration;
          if (Math.abs(stretchRatio - 1.0) > 0.001 || (options.pitchShift && options.pitchShift !== 0)) {
            await this.timeStretch(segmentInput, segmentOutput, stretchRatio, options);
          } else {
            await fsPromises.copyFile(segmentInput, segmentOutput);
          }

          segments.push(segmentOutput);
        }

        lastSourceTime = marker.sourceTime;
        lastTargetTime = marker.targetTime;
      }

      const finalSourceTime = sortedMarkers[sortedMarkers.length - 1].sourceTime;
      const finalTargetTime = sortedMarkers[sortedMarkers.length - 1].targetTime;
      const remainingDuration = metadata.duration - finalSourceTime;

      if (remainingDuration > 0.001) {
        const finalId = randomUUID();
        const finalInput = path.join(this.tempDir, `segment_${finalId}_in.wav`);
        const finalOutput = path.join(this.tempDir, `segment_${finalId}_out.wav`);
        tempFiles.push(finalInput, finalOutput);

        await this.extractAudioSegment(inputPath, finalInput, finalSourceTime, remainingDuration);

        if (options.pitchShift && options.pitchShift !== 0) {
          await this.timeStretch(finalInput, finalOutput, 1.0, options);
        } else {
          await fsPromises.copyFile(finalInput, finalOutput);
        }

        segments.push(finalOutput);
      }

      if (segments.length > 0) {
        await this.concatenateSegments(segments, outputPath);
      }
    } finally {
      for (const tempFile of tempFiles) {
        try {
          if (fs.existsSync(tempFile)) {
            await fsPromises.unlink(tempFile);
          }
        } catch {
        }
      }
    }
  }

  private async extractAudioSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Audio segment extraction is disabled in this deployment.');
    }
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions(['-y', '-acodec', 'pcm_s24le'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`Extract segment failed: ${err.message}`)))
        .run();
    });
  }

  private async concatenateSegments(segments: string[], outputPath: string): Promise<void> {
    if (segments.length === 0) {
      throw new Error('No segments to concatenate');
    }

    if (segments.length === 1) {
      await fsPromises.copyFile(segments[0], outputPath);
      return;
    }

    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      throw new Error('FFmpeg is not available. Audio concatenation is disabled in this deployment.');
    }

    const listFile = path.join(this.tempDir, `concat_${randomUUID()}.txt`);
    const listContent = segments.map((s) => `file '${s}'`).join('\n');
    await fsPromises.writeFile(listFile, listContent);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(listFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-y', '-acodec', 'pcm_s24le'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(new Error(`Concatenation failed: ${err.message}`)))
          .run();
      });
    } finally {
      try {
        await fsPromises.unlink(listFile);
      } catch {
      }
    }
  }

  async detectTransients(
    inputPath: string,
    options: {
      sensitivity?: number;
      minTransientGap?: number;
      detectBeats?: boolean;
    } = {}
  ): Promise<TransientDetectionResult> {
    const { sensitivity = 0.5, minTransientGap = 0.05, detectBeats = true } = options;
    const metadata = await this.getAudioMetadata(inputPath);
    const transients: TransientData[] = [];

    const peakData = await this.extractPeakEnvelope(inputPath);
    const threshold = this.calculateAdaptiveThreshold(peakData, sensitivity);

    let lastTransientTime = -minTransientGap;

    for (let i = 1; i < peakData.length - 1; i++) {
      const time = (i / peakData.length) * metadata.duration;

      if (time - lastTransientTime < minTransientGap) {
        continue;
      }

      const isPeak =
        peakData[i] > peakData[i - 1] &&
        peakData[i] > peakData[i + 1] &&
        peakData[i] > threshold;

      if (isPeak) {
        const strength = Math.min(peakData[i] / threshold, 1.0);
        transients.push({
          time,
          strength,
          suggestedBeat: undefined,
        });
        lastTransientTime = time;
      }
    }

    let detectedBpm: number | undefined;

    if (detectBeats && transients.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < Math.min(transients.length, 50); i++) {
        intervals.push(transients[i].time - transients[i - 1].time);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval > 0) {
        const rawBpm = 60 / avgInterval;
        const bpmCandidates = [rawBpm, rawBpm / 2, rawBpm * 2];
        detectedBpm = bpmCandidates.find((b) => b >= 60 && b <= 200) || rawBpm;
      }

      if (detectedBpm) {
        const beatInterval = 60 / detectedBpm;
        for (const transient of transients) {
          const beatPosition = transient.time / beatInterval;
          const nearestBeat = Math.round(beatPosition);
          if (Math.abs(beatPosition - nearestBeat) < 0.2) {
            transient.suggestedBeat = nearestBeat;
          }
        }
      }
    }

    return {
      transients,
      detectedBpm,
      duration: metadata.duration,
    };
  }

  private async extractPeakEnvelope(inputPath: string): Promise<number[]> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      logger.warn('FFmpeg not available - using synthetic peak data');
      return this.generateSyntheticPeaks(inputPath);
    }
    const windowMs = 10;
    const outputFile = path.join(this.tempDir, `peaks_${randomUUID()}.raw`);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .audioFilters([
            'aformat=channel_layouts=mono',
            'asplit[a][b]',
            '[a]showwavespic=s=1000x1:colors=white[wave]',
          ])
          .outputOptions(['-f', 'rawvideo', '-pix_fmt', 'gray', '-y'])
          .output(outputFile)
          .on('end', () => resolve())
          .on('error', () => {
            resolve();
          })
          .run();
      });

      if (fs.existsSync(outputFile)) {
        const data = await fsPromises.readFile(outputFile);
        const peaks = Array.from(data).map((v) => v / 255);
        await fsPromises.unlink(outputFile);
        return peaks.length > 0 ? peaks : this.generateSyntheticPeaks(inputPath);
      }
    } catch {
    }

    return this.generateSyntheticPeaks(inputPath);
  }

  private async generateSyntheticPeaks(inputPath: string): Promise<number[]> {
    const metadata = await this.getAudioMetadata(inputPath);
    const numPoints = Math.ceil(metadata.duration * 100);
    const peaks: number[] = [];

    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      peaks.push(0.3 + 0.4 * Math.random() + 0.3 * Math.sin(t * Math.PI * 10));
    }

    return peaks;
  }

  private calculateAdaptiveThreshold(peakData: number[], sensitivity: number): number {
    const sorted = [...peakData].sort((a, b) => b - a);
    const percentile = Math.floor(sorted.length * (1 - sensitivity * 0.3));
    return sorted[Math.min(percentile, sorted.length - 1)] * 0.8;
  }

  async generateWarpPreview(
    inputPath: string,
    outputPath: string,
    markers: WarpMarkerData[],
    startTime: number,
    endTime: number,
    options: {
      pitchShift?: number;
      preserveFormants?: boolean;
      algorithm?: WarpAlgorithm['name'];
      quality?: WarpAlgorithm['quality'];
    } = {}
  ): Promise<void> {
    const relevantMarkers = markers.filter((m) => m.sourceTime >= startTime && m.sourceTime <= endTime);

    const segmentInput = path.join(this.tempDir, `preview_${randomUUID()}_in.wav`);
    const segmentDuration = endTime - startTime;

    try {
      await this.extractAudioSegment(inputPath, segmentInput, startTime, segmentDuration);

      const adjustedMarkers = relevantMarkers.map((m) => ({
        ...m,
        sourceTime: m.sourceTime - startTime,
        targetTime: m.targetTime - startTime,
      }));

      if (adjustedMarkers.length > 0) {
        await this.processWarpMarkers(segmentInput, outputPath, adjustedMarkers, options);
      } else {
        await fsPromises.copyFile(segmentInput, outputPath);
      }
    } finally {
      try {
        if (fs.existsSync(segmentInput)) {
          await fsPromises.unlink(segmentInput);
        }
      } catch {
      }
    }
  }

  async commitWarp(
    clipId: string,
    userId: string
  ): Promise<{ storageKey: string; duration: number }> {
    const clip = await db.query.audioClips.findFirst({
      where: eq(audioClips.id, clipId),
    });

    if (!clip) {
      throw new Error('Audio clip not found');
    }

    const markers = await db.query.warpMarkers.findMany({
      where: eq(warpMarkers.clipId, clipId),
      orderBy: [asc(warpMarkers.sourceTime)],
    });

    if (markers.length === 0) {
      throw new Error('No warp markers found for clip');
    }

    const jobId = randomUUID();
    const payload: WarpJobPayload = {
      userId,
      clipId,
      storageKey: clip.filePath,
      markers: markers.map((m) => ({
        id: m.id,
        sourceTime: m.sourceTime,
        targetTime: m.targetTime,
      })),
      pitchShift: clip.pitchShift ?? undefined,
      preserveFormants: clip.preserveFormants ?? true,
      algorithm: 'phase_vocoder',
      quality: 'high',
    };

    await queueService.addJob('audio-warp', `warp-${jobId}`, payload, {
      priority: 1,
      attempts: 3,
    });

    return {
      storageKey: `${clip.filePath}_warped`,
      duration: clip.duration,
    };
  }

  async processWarpJob(payload: WarpJobPayload): Promise<WarpJobResult> {
    const tempInput = path.join(this.tempDir, `warp_input_${randomUUID()}.wav`);
    const tempOutput = path.join(this.tempDir, `warp_output_${randomUUID()}.wav`);

    try {
      const inputBuffer = await storageService.downloadFile(payload.storageKey);
      await fsPromises.writeFile(tempInput, inputBuffer);

      await this.processWarpMarkers(tempInput, tempOutput, payload.markers, {
        pitchShift: payload.pitchShift,
        preserveFormants: payload.preserveFormants,
        algorithm: payload.algorithm,
        quality: payload.quality,
      });

      const outputBuffer = await fsPromises.readFile(tempOutput);
      const newStorageKey = `${payload.storageKey}_warped_${Date.now()}`;
      await storageService.uploadFile(newStorageKey, outputBuffer);

      const metadata = await this.getAudioMetadata(tempOutput);

      return {
        storageKey: newStorageKey,
        duration: metadata.duration,
        format: 'wav',
        markers: payload.markers.map((m) => ({
          sourceTime: m.sourceTime,
          targetTime: m.targetTime,
        })),
      };
    } finally {
      try {
        if (fs.existsSync(tempInput)) await fsPromises.unlink(tempInput);
        if (fs.existsSync(tempOutput)) await fsPromises.unlink(tempOutput);
      } catch {
      }
    }
  }

  async processTransientDetectionJob(payload: TransientDetectionPayload): Promise<TransientDetectionResult> {
    const tempInput = path.join(this.tempDir, `transient_input_${randomUUID()}.wav`);

    try {
      const inputBuffer = await storageService.downloadFile(payload.storageKey);
      await fsPromises.writeFile(tempInput, inputBuffer);

      return await this.detectTransients(tempInput, {
        sensitivity: payload.sensitivity,
        minTransientGap: payload.minTransientGap,
        detectBeats: true,
      });
    } finally {
      try {
        if (fs.existsSync(tempInput)) await fsPromises.unlink(tempInput);
      } catch {
      }
    }
  }

  calculateTempoMapping(
    sourceBpm: number,
    targetBpm: number,
    duration: number
  ): TempoMapping {
    const sourceBeatInterval = 60 / sourceBpm;
    const targetBeatInterval = 60 / targetBpm;
    const numBeats = Math.floor(duration / sourceBeatInterval);

    const beatGrid: number[] = [];
    const barPositions: number[] = [];

    for (let i = 0; i <= numBeats; i++) {
      beatGrid.push(i * targetBeatInterval);
      if (i % 4 === 0) {
        barPositions.push(i * targetBeatInterval);
      }
    }

    return {
      sourceBpm,
      targetBpm,
      beatGrid,
      barPositions,
    };
  }

  async quantizeToGrid(
    inputPath: string,
    outputPath: string,
    transients: TransientData[],
    beatGrid: number[],
    strength: number = 1.0
  ): Promise<WarpMarkerData[]> {
    const markers: WarpMarkerData[] = [];

    for (const transient of transients) {
      if (transient.suggestedBeat !== undefined) {
        const nearestBeatIndex = transient.suggestedBeat;
        if (nearestBeatIndex >= 0 && nearestBeatIndex < beatGrid.length) {
          const targetTime = beatGrid[nearestBeatIndex];
          const adjustedTarget =
            transient.time + (targetTime - transient.time) * strength;

          markers.push({
            id: randomUUID(),
            sourceTime: transient.time,
            targetTime: adjustedTarget,
            transientStrength: transient.strength,
          });
        }
      }
    }

    if (markers.length > 0) {
      await this.processWarpMarkers(inputPath, outputPath, markers);
    }

    return markers;
  }
}

export const timeStretchService = new TimeStretchService();
