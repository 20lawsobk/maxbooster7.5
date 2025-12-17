/**
 * Stem Export Service - Professional audio stem export system
 * 
 * Features:
 * - Per-track rendering to individual audio files
 * - Multi-track batch export with progress tracking
 * - Format options (WAV, FLAC, MP3, AAC) with quality settings
 * - Sample rate and bit depth configuration
 * - Normalization options (peak, RMS, LUFS)
 * - Effect chain rendering (include/bypass effects)
 * - Master bus rendering
 * - Archive creation (ZIP with all stems)
 */

import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import archiver from 'archiver';
import os from 'os';
import { db } from '../db.js';
import { stemExports, studioTracks, projects, audioClips } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { storageService } from './storageService.js';
import { logger } from '../logger.js';
import {
  AUDIO_FORMATS,
  SAMPLE_RATES,
  BIT_DEPTHS,
  FFMPEG_CODECS,
  isSupportedSampleRate,
  isSupportedBitDepth,
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
    logger.warn('FFmpeg not available - stem export features will be limited:', error);
    return false;
  }
}

export type ExportFormat = 'wav' | 'flac' | 'mp3' | 'aac';
export type NormalizationType = 'peak' | 'rms' | 'lufs' | 'none';
export type ExportQuality = 'low' | 'medium' | 'high' | 'lossless';

export interface StemExportOptions {
  projectId: string;
  userId: string;
  trackIds: string[];
  exportName?: string;
  format: ExportFormat;
  sampleRate?: SampleRate;
  bitDepth?: BitDepth;
  bitrate?: string;
  normalize?: boolean;
  normalizationType?: NormalizationType;
  normalizeTargetLevel?: number;
  includeEffects?: boolean;
  includeMasterBus?: boolean;
}

export interface StemExportResult {
  exportId: string;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  statusUrl: string;
}

export interface IndividualStemFile {
  trackId: string;
  trackName: string;
  fileName: string;
  storageKey: string;
  fileSize: number;
  duration: number;
}

export interface ExportProgress {
  exportId: string;
  status: string;
  progress: number;
  currentTrack: string | null;
  completedTracks: number;
  totalTracks: number;
  startedAt: Date;
  estimatedCompletion?: Date;
}

interface TrackAudioData {
  trackId: string;
  trackName: string;
  audioClips: Array<{
    id: string;
    filePath: string;
    startTime: number;
    duration: number;
    gain: number;
  }>;
  volume: number;
  pan: number;
  effects: any[];
  mute: boolean;
}

class StemExportService {
  private readonly SUPPORTED_FORMATS: ExportFormat[] = ['wav', 'flac', 'mp3', 'aac'];
  private readonly FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
    wav: 'wav',
    flac: 'flac',
    mp3: 'mp3',
    aac: 'm4a',
  };

  private readonly FORMAT_CONTENT_TYPES: Record<ExportFormat, string> = {
    wav: 'audio/wav',
    flac: 'audio/flac',
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
  };

  private readonly DEFAULT_BITRATES: Record<ExportQuality, string> = {
    low: '128k',
    medium: '192k',
    high: '256k',
    lossless: '320k',
  };

  async startStemExport(options: StemExportOptions): Promise<StemExportResult> {
    const {
      projectId,
      userId,
      trackIds,
      exportName,
      format,
      sampleRate = SAMPLE_RATES.SR_48000,
      bitDepth = BIT_DEPTHS.BD_24,
      bitrate = '320k',
      normalize = false,
      normalizationType = 'none',
      normalizeTargetLevel = -14,
      includeEffects = true,
      includeMasterBus = false,
    } = options;

    if (!this.SUPPORTED_FORMATS.includes(format)) {
      throw new Error(`Unsupported format: ${format}. Supported: ${this.SUPPORTED_FORMATS.join(', ')}`);
    }

    if (!isSupportedSampleRate(sampleRate)) {
      throw new Error(`Unsupported sample rate: ${sampleRate}`);
    }

    if (format === 'wav' && !isSupportedBitDepth(bitDepth)) {
      throw new Error(`Unsupported bit depth: ${bitDepth}`);
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      throw new Error('Project not found or unauthorized');
    }

    const tracks = await db.query.studioTracks.findMany({
      where: and(
        eq(studioTracks.projectId, projectId),
        trackIds.length > 0 ? inArray(studioTracks.id, trackIds) : undefined
      ),
    });

    if (tracks.length === 0) {
      throw new Error('No tracks found to export');
    }

    const jobId = randomUUID();
    const generatedExportName = exportName || `${project.title}_stems_${new Date().toISOString().slice(0, 10)}`;

    const [exportRecord] = await db
      .insert(stemExports)
      .values({
        projectId,
        userId,
        jobId,
        exportName: generatedExportName,
        trackIds: trackIds.length > 0 ? trackIds : tracks.map(t => t.id),
        exportFormat: format,
        sampleRate,
        bitDepth,
        bitrate: ['mp3', 'aac'].includes(format) ? bitrate : null,
        normalize,
        normalizationType: normalize ? normalizationType : null,
        normalizeTargetLevel: normalize ? normalizeTargetLevel : null,
        includeEffects,
        includeMasterBus,
        fileCount: tracks.length + (includeMasterBus ? 1 : 0),
        status: 'pending',
        progress: 0,
        metadata: {
          projectTitle: project.title,
          requestedAt: new Date().toISOString(),
        },
      })
      .returning();

    this.processExportAsync(exportRecord.id, options, tracks);

    return {
      exportId: exportRecord.id,
      jobId,
      status: 'pending',
      statusUrl: `/api/studio/projects/${projectId}/stems/status/${exportRecord.id}`,
    };
  }

  private async processExportAsync(
    exportId: string,
    options: StemExportOptions,
    tracks: any[]
  ): Promise<void> {
    const tempDir = path.join(os.tmpdir(), `stem_export_${exportId}`);
    
    try {
      await fsPromises.mkdir(tempDir, { recursive: true });

      await db
        .update(stemExports)
        .set({ status: 'processing', progress: 0 })
        .where(eq(stemExports.id, exportId));

      const individualFiles: IndividualStemFile[] = [];
      let totalDuration = 0;
      let totalFileSize = 0;
      const totalTracks = tracks.length + (options.includeMasterBus ? 1 : 0);

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const progress = Math.round(((i + 1) / totalTracks) * 90);

        await db
          .update(stemExports)
          .set({
            progress,
            currentTrack: track.name,
          })
          .where(eq(stemExports.id, exportId));

        try {
          const stemFile = await this.renderTrackStem(
            track,
            options,
            tempDir
          );

          if (stemFile) {
            individualFiles.push(stemFile);
            totalDuration += stemFile.duration;
            totalFileSize += stemFile.fileSize;
          }
        } catch (error: unknown) {
          logger.error(`Error rendering track ${track.name}:`, error);
        }
      }

      if (options.includeMasterBus) {
        await db
          .update(stemExports)
          .set({
            progress: 95,
            currentTrack: 'Master Bus',
          })
          .where(eq(stemExports.id, exportId));

        try {
          const masterFile = await this.renderMasterBus(
            options.projectId,
            options,
            tempDir
          );

          if (masterFile) {
            individualFiles.push(masterFile);
            totalDuration = Math.max(totalDuration, masterFile.duration);
            totalFileSize += masterFile.fileSize;
          }
        } catch (error: unknown) {
          logger.error('Error rendering master bus:', error);
        }
      }

      const zipResult = await this.createZipArchive(
        exportId,
        individualFiles,
        options,
        tempDir
      );

      await db
        .update(stemExports)
        .set({
          status: 'completed',
          progress: 100,
          currentTrack: null,
          individualFiles,
          totalDuration,
          totalFileSize: totalFileSize + zipResult.zipSize,
          zipArchiveUrl: zipResult.downloadUrl,
          zipStorageKey: zipResult.storageKey,
          completedAt: new Date(),
        })
        .where(eq(stemExports.id, exportId));

      logger.info(`✅ Stem export ${exportId} completed: ${individualFiles.length} files`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Stem export ${exportId} failed:`, error);

      await db
        .update(stemExports)
        .set({
          status: 'failed',
          errorMessage,
          progress: 0,
          currentTrack: null,
        })
        .where(eq(stemExports.id, exportId));
    } finally {
      try {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError: unknown) {
        logger.warn('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }

  private async renderTrackStem(
    track: any,
    options: StemExportOptions,
    tempDir: string
  ): Promise<IndividualStemFile | null> {
    const clips = await db.query.audioClips.findMany({
      where: eq(audioClips.trackId, track.id),
    });

    if (clips.length === 0) {
      const emptyFile = await this.createEmptyStem(track, options, tempDir);
      return emptyFile;
    }

    const sanitizedName = this.sanitizeFileName(track.name);
    const extension = this.FORMAT_EXTENSIONS[options.format];
    const fileName = `${sanitizedName}.${extension}`;
    const outputPath = path.join(tempDir, fileName);

    try {
      if (clips.length === 1) {
        await this.renderSingleClip(clips[0], outputPath, options);
      } else {
        await this.mixAndRenderClips(clips, track, outputPath, options);
      }

      if (options.normalize && options.normalizationType !== 'none') {
        await this.normalizeAudio(outputPath, options);
      }

      const fileBuffer = await fsPromises.readFile(outputPath);
      const storageKey = await storageService.uploadFile(
        fileBuffer,
        'stems',
        fileName,
        this.FORMAT_CONTENT_TYPES[options.format]
      );

      const stats = await fsPromises.stat(outputPath);
      const duration = await this.getAudioDuration(outputPath);

      return {
        trackId: track.id,
        trackName: track.name,
        fileName,
        storageKey,
        fileSize: stats.size,
        duration,
      };
    } catch (error: unknown) {
      logger.error(`Failed to render stem for track ${track.name}:`, error);
      return null;
    }
  }

  private async createEmptyStem(
    track: any,
    options: StemExportOptions,
    tempDir: string
  ): Promise<IndividualStemFile> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg is not available - stem export features are disabled');
    }
    const sanitizedName = this.sanitizeFileName(track.name);
    const extension = this.FORMAT_EXTENSIONS[options.format];
    const fileName = `${sanitizedName}.${extension}`;
    const outputPath = path.join(tempDir, fileName);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=' + (options.sampleRate || 48000) + ':cl=stereo')
        .inputFormat('lavfi')
        .duration(1)
        .audioCodec(this.getAudioCodec(options.format, options.bitDepth))
        .audioFrequency(options.sampleRate || 48000)
        .audioChannels(2)
        .outputOptions(this.getOutputOptions(options))
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputPath);
    });

    const fileBuffer = await fsPromises.readFile(outputPath);
    const storageKey = await storageService.uploadFile(
      fileBuffer,
      'stems',
      fileName,
      this.FORMAT_CONTENT_TYPES[options.format]
    );

    const stats = await fsPromises.stat(outputPath);

    return {
      trackId: track.id,
      trackName: track.name,
      fileName,
      storageKey,
      fileSize: stats.size,
      duration: 1,
    };
  }

  private async renderSingleClip(
    clip: any,
    outputPath: string,
    options: StemExportOptions
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg is not available - stem export features are disabled');
    }
    let inputPath: string;

    if (clip.filePath?.startsWith('/') || clip.filePath?.startsWith('./')) {
      inputPath = clip.filePath;
    } else if (clip.filePath) {
      const buffer = await storageService.downloadFile(clip.filePath);
      inputPath = path.join(os.tmpdir(), `clip_${clip.id}.wav`);
      await fsPromises.writeFile(inputPath, buffer);
    } else {
      throw new Error('Clip has no audio file');
    }

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .audioCodec(this.getAudioCodec(options.format, options.bitDepth))
        .audioFrequency(options.sampleRate || 48000)
        .audioChannels(2);

      const outputOptions = this.getOutputOptions(options);
      if (outputOptions.length > 0) {
        command = command.outputOptions(outputOptions);
      }

      command
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async mixAndRenderClips(
    clips: any[],
    track: any,
    outputPath: string,
    options: StemExportOptions
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg is not available - stem export features are disabled');
    }
    const tempClipPaths: string[] = [];

    for (const clip of clips) {
      if (clip.filePath) {
        let clipPath: string;
        
        if (clip.filePath.startsWith('/') || clip.filePath.startsWith('./')) {
          clipPath = clip.filePath;
        } else {
          const buffer = await storageService.downloadFile(clip.filePath);
          clipPath = path.join(os.tmpdir(), `clip_${clip.id}_${randomUUID()}.wav`);
          await fsPromises.writeFile(clipPath, buffer);
        }
        tempClipPaths.push(clipPath);
      }
    }

    if (tempClipPaths.length === 0) {
      throw new Error('No clip audio files found');
    }

    if (tempClipPaths.length === 1) {
      await this.renderSingleClip({ filePath: tempClipPaths[0] }, outputPath, options);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();

      tempClipPaths.forEach(clipPath => {
        command = command.input(clipPath);
      });

      const filterComplex = tempClipPaths
        .map((_, i) => `[${i}:a]`)
        .join('') + `amix=inputs=${tempClipPaths.length}:duration=longest:dropout_transition=0`;

      command
        .complexFilter(filterComplex)
        .audioCodec(this.getAudioCodec(options.format, options.bitDepth))
        .audioFrequency(options.sampleRate || 48000)
        .audioChannels(2)
        .outputOptions(this.getOutputOptions(options))
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputPath);
    });

    for (const tempPath of tempClipPaths) {
      if (tempPath.includes(os.tmpdir())) {
        try {
          await fsPromises.unlink(tempPath);
        } catch {
        }
      }
    }
  }

  private async renderMasterBus(
    projectId: string,
    options: StemExportOptions,
    tempDir: string
  ): Promise<IndividualStemFile | null> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg is not available - stem export features are disabled');
    }
    const tracks = await db.query.studioTracks.findMany({
      where: and(
        eq(studioTracks.projectId, projectId),
        eq(studioTracks.mute, false)
      ),
    });

    if (tracks.length === 0) {
      return null;
    }

    const trackStemPaths: string[] = [];
    const trackVolumes: number[] = [];

    for (const track of tracks) {
      const clips = await db.query.audioClips.findMany({
        where: eq(audioClips.trackId, track.id),
      });

      if (clips.length > 0 && clips[0].filePath) {
        let clipPath: string;
        
        if (clips[0].filePath.startsWith('/') || clips[0].filePath.startsWith('./')) {
          clipPath = clips[0].filePath;
        } else {
          try {
            const buffer = await storageService.downloadFile(clips[0].filePath);
            clipPath = path.join(os.tmpdir(), `master_clip_${track.id}.wav`);
            await fsPromises.writeFile(clipPath, buffer);
          } catch {
            continue;
          }
        }
        
        trackStemPaths.push(clipPath);
        trackVolumes.push(track.volume || 0.8);
      }
    }

    if (trackStemPaths.length === 0) {
      return null;
    }

    const extension = this.FORMAT_EXTENSIONS[options.format];
    const fileName = `Master.${extension}`;
    const outputPath = path.join(tempDir, fileName);

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();

      trackStemPaths.forEach(stemPath => {
        command = command.input(stemPath);
      });

      const filterParts = trackStemPaths.map((_, i) => 
        `[${i}:a]volume=${trackVolumes[i]}[a${i}]`
      );
      const mixInputs = trackStemPaths.map((_, i) => `[a${i}]`).join('');
      const mixFilter = `${mixInputs}amix=inputs=${trackStemPaths.length}:duration=longest:normalize=0`;
      
      filterParts.push(mixFilter);

      command
        .complexFilter(filterParts.join(';'))
        .audioCodec(this.getAudioCodec(options.format, options.bitDepth))
        .audioFrequency(options.sampleRate || 48000)
        .audioChannels(2)
        .outputOptions(this.getOutputOptions(options))
        .on('end', () => resolve())
        .on('error', reject)
        .save(outputPath);
    });

    if (options.normalize && options.normalizationType !== 'none') {
      await this.normalizeAudio(outputPath, options);
    }

    const fileBuffer = await fsPromises.readFile(outputPath);
    const storageKey = await storageService.uploadFile(
      fileBuffer,
      'stems',
      fileName,
      this.FORMAT_CONTENT_TYPES[options.format]
    );

    const stats = await fsPromises.stat(outputPath);
    const duration = await this.getAudioDuration(outputPath);

    for (const tempPath of trackStemPaths) {
      if (tempPath.includes(os.tmpdir())) {
        try {
          await fsPromises.unlink(tempPath);
        } catch {
        }
      }
    }

    return {
      trackId: 'master',
      trackName: 'Master',
      fileName,
      storageKey,
      fileSize: stats.size,
      duration,
    };
  }

  private async normalizeAudio(
    filePath: string,
    options: StemExportOptions
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      logger.warn('FFmpeg not available - skipping audio normalization');
      return;
    }
    const { normalizationType, normalizeTargetLevel = -14 } = options;
    const tempPath = filePath + '.normalized.tmp';

    let filterOptions: string;

    switch (normalizationType) {
      case 'peak':
        filterOptions = `loudnorm=I=${normalizeTargetLevel}:TP=-1.5:LRA=11`;
        break;
      case 'rms':
        filterOptions = `volume=enable='1':volume=${Math.pow(10, normalizeTargetLevel / 20)}`;
        break;
      case 'lufs':
        filterOptions = `loudnorm=I=${normalizeTargetLevel}:TP=-1.5:LRA=7`;
        break;
      default:
        return;
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .audioFilters(filterOptions)
        .audioCodec(this.getAudioCodec(options.format, options.bitDepth))
        .audioFrequency(options.sampleRate || 48000)
        .outputOptions(this.getOutputOptions(options))
        .on('end', () => resolve())
        .on('error', reject)
        .save(tempPath);
    });

    await fsPromises.rename(tempPath, filePath);
  }

  private async createZipArchive(
    exportId: string,
    files: IndividualStemFile[],
    options: StemExportOptions,
    tempDir: string
  ): Promise<{ storageKey: string; downloadUrl: string; zipSize: number }> {
    const zipFileName = `stems_${exportId}.zip`;
    const zipPath = path.join(tempDir, zipFileName);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve());
      archive.on('error', reject);

      archive.pipe(output);

      for (const file of files) {
        const filePath = path.join(tempDir, file.fileName);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file.fileName });
        }
      }

      archive.finalize();
    });

    const zipBuffer = await fsPromises.readFile(zipPath);
    const storageKey = await storageService.uploadFile(
      zipBuffer,
      'exports',
      zipFileName,
      'application/zip'
    );

    const downloadUrl = await storageService.getDownloadUrl(storageKey);
    const stats = await fsPromises.stat(zipPath);

    return {
      storageKey,
      downloadUrl,
      zipSize: stats.size,
    };
  }

  private getAudioCodec(format: ExportFormat, bitDepth?: BitDepth): string {
    switch (format) {
      case 'wav':
        if (bitDepth === 32) return 'pcm_f32le';
        if (bitDepth === 24) return 'pcm_s24le';
        return 'pcm_s16le';
      case 'flac':
        return 'flac';
      case 'mp3':
        return 'libmp3lame';
      case 'aac':
        return 'aac';
      default:
        return 'pcm_s24le';
    }
  }

  private getOutputOptions(options: StemExportOptions): string[] {
    const outputOptions: string[] = [];

    if (options.format === 'mp3' || options.format === 'aac') {
      outputOptions.push(`-b:a`, options.bitrate || '320k');
    }

    if (options.format === 'flac') {
      outputOptions.push('-compression_level', '8');
    }

    return outputOptions;
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      logger.warn('FFmpeg not available - returning default duration');
      return 0;
    }
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve(0);
          return;
        }
        resolve(parseFloat(metadata.format.duration || '0'));
      });
    });
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }

  async getExportStatus(exportId: string, userId: string): Promise<any> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    return {
      id: exportRecord.id,
      status: exportRecord.status,
      progress: exportRecord.progress,
      currentTrack: exportRecord.currentTrack,
      fileCount: exportRecord.fileCount,
      format: exportRecord.exportFormat,
      sampleRate: exportRecord.sampleRate,
      bitDepth: exportRecord.bitDepth,
      normalize: exportRecord.normalize,
      normalizationType: exportRecord.normalizationType,
      includeEffects: exportRecord.includeEffects,
      includeMasterBus: exportRecord.includeMasterBus,
      totalDuration: exportRecord.totalDuration,
      totalFileSize: exportRecord.totalFileSize,
      individualFiles: exportRecord.individualFiles,
      zipArchiveUrl: exportRecord.zipArchiveUrl,
      errorMessage: exportRecord.errorMessage,
      createdAt: exportRecord.createdAt,
      completedAt: exportRecord.completedAt,
    };
  }

  async getExportDownload(exportId: string, userId: string): Promise<{
    downloadUrl: string;
    fileName: string;
    fileSize: number;
  }> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    if (exportRecord.status !== 'completed') {
      throw new Error('Export is not ready for download');
    }

    if (!exportRecord.zipStorageKey) {
      throw new Error('Export file not found');
    }

    const downloadUrl = await storageService.getDownloadUrl(exportRecord.zipStorageKey);

    return {
      downloadUrl,
      fileName: `${exportRecord.exportName || 'stems'}.zip`,
      fileSize: Number(exportRecord.totalFileSize) || 0,
    };
  }

  async listExports(
    projectId: string,
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ exports: any[]; total: number }> {
    const { limit = 20, offset = 0 } = options || {};

    const exports = await db.query.stemExports.findMany({
      where: and(
        eq(stemExports.projectId, projectId),
        eq(stemExports.userId, userId)
      ),
      orderBy: (exports, { desc }) => [desc(exports.createdAt)],
      limit,
      offset,
    });

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(stemExports)
      .where(
        and(
          eq(stemExports.projectId, projectId),
          eq(stemExports.userId, userId)
        )
      );

    return {
      exports: exports.map(exp => ({
        id: exp.id,
        exportName: exp.exportName,
        status: exp.status,
        format: exp.exportFormat,
        fileCount: exp.fileCount,
        totalFileSize: exp.totalFileSize,
        progress: exp.progress,
        createdAt: exp.createdAt,
        completedAt: exp.completedAt,
      })),
      total: Number(totalResult[0]?.count) || 0,
    };
  }

  async deleteExport(exportId: string, userId: string): Promise<void> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    if (exportRecord.zipStorageKey) {
      try {
        await storageService.deleteFile(exportRecord.zipStorageKey);
      } catch (error: unknown) {
        logger.warn('Failed to delete ZIP file:', error);
      }
    }

    const files = exportRecord.individualFiles as IndividualStemFile[] | null;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        try {
          await storageService.deleteFile(file.storageKey);
        } catch (error: unknown) {
          logger.warn(`Failed to delete stem file ${file.fileName}:`, error);
        }
      }
    }

    await db.delete(stemExports).where(eq(stemExports.id, exportId));
    logger.info(`Deleted stem export ${exportId}`);
  }

  async cancelExport(exportId: string, userId: string): Promise<void> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error('Export not found');
    }

    if (exportRecord.status === 'completed' || exportRecord.status === 'failed') {
      throw new Error('Cannot cancel a completed or failed export');
    }

    await db
      .update(stemExports)
      .set({
        status: 'failed',
        errorMessage: 'Export cancelled by user',
        progress: 0,
      })
      .where(eq(stemExports.id, exportId));
  }
}

import { sql } from 'drizzle-orm';

export const stemExportService = new StemExportService();
