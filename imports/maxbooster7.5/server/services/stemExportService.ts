// @ts-nocheck
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

import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import archiver from "archiver";
import os from "os";
import { db } from "../db.js";
import {
  stemExports,
  studioTracks,
  projects,
  audioClips,
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { storageService } from "./storageService.js";
import { resolveAudioUrlToLocalFile } from "./audioSourceResolver.js";
import { apiCache } from "../middleware/apiCache.js";
import { logger } from "../logger.js";
import { SAMPLE_RATES, BIT_DEPTHS, isSupportedSampleRate, isSupportedBitDepth, type SampleRate, type BitDepth } from "../../shared/audioConstants.js";

let ffmpeg: Record<string, unknown> | null = null;
let ffmpegAvailable = false;

async function initializeFfmpeg() {
  if (ffmpegAvailable) return true;
  try {
    const fluentFfmpeg = await import("fluent-ffmpeg");
    ffmpeg = fluentFfmpeg?.default;
    try {
      const ffmpegStatic = await import("ffmpeg-static");
      if (ffmpegStatic?.default) {
        (ffmpeg as any)?.setFfmpegPath(ffmpegStatic?.default);
      }
    } catch {
      logger.warn("ffmpeg-static not available, using system ffmpeg");
    }
    ffmpegAvailable = true;
    return true;
  } catch (error) {
    logger.warn(
      { err: error },
      "FFmpeg not available - stem export features will be limited:",
    );
    return false;
  }
}

export type ExportFormat = "wav" | "flac" | "mp3" | "aac";
export type NormalizationType = "peak" | "rms" | "lufs" | "none";
export type ExportQuality = "low" | "medium" | "high" | "lossless";

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
  status: "pending" | "processing" | "completed" | "failed";
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


class StemExportService {
  private readonly SUPPORTED_FORMATS: ExportFormat[] = [
    "wav",
    "flac",
    "mp3",
    "aac",
  ];
  private readonly FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
    wav: "wav",
    flac: "flac",
    mp3: "mp3",
    aac: "m4a",
  };

  private readonly FORMAT_CONTENT_TYPES: Record<ExportFormat, string> = {
    wav: "audio/wav",
    flac: "audio/flac",
    mp3: "audio/mpeg",
    aac: "audio/aac",
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
      bitrate = "320k",
      normalize = false,
      normalizationType = "none",
      normalizeTargetLevel = -14,
      includeEffects = true,
      includeMasterBus = false,
    } = options;

    if (!this.SUPPORTED_FORMATS.includes(format)) {
      throw new Error(
        `Unsupported format: ${format}. Supported: ${this.SUPPORTED_FORMATS.join(", ")}`,
      );
    }

    if (!isSupportedSampleRate(sampleRate)) {
      throw new Error(`Unsupported sample rate: ${sampleRate}`);
    }

    if (format === "wav" && !isSupportedBitDepth(bitDepth)) {
      throw new Error(`Unsupported bit depth: ${bitDepth}`);
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      throw new Error("Project not found or unauthorized");
    }

    const tracks = await db.query.studioTracks.findMany({
      where: and(
        eq(studioTracks.projectId, projectId),
        trackIds?.length > 0 ? inArray(studioTracks.id, trackIds) : undefined,
      ),
    });

    if (tracks?.length === 0) {
      throw new Error("No tracks found to export");
    }

    const jobId = randomUUID();
    const generatedExportName =
      exportName ||
      `${project?.title}_stems_${new Date().toISOString().slice(0, 10)}`;

    const [exportRecord] = await db
      .insert(stemExports)
      .values({
        projectId,
        userId,
        jobId,
        // `name`/`format` are the original (legacy) required columns on this
        // table; `exportName`/`exportFormat` are the richer fields the rest
        // of this service actually reads. Keep both populated with the same
        // values so the row satisfies the legacy NOT NULL constraint on
        // `name` and neither column silently drifts from the truth.
        name: generatedExportName,
        exportName: generatedExportName,
        trackIds: trackIds.length > 0 ? trackIds : tracks?.map((t) => t?.id),
        format,
        exportFormat: format,
        sampleRate,
        bitDepth,
        bitrate: ["mp3", "aac"].includes(format) ? bitrate : null,
        normalize,
        normalizationType: normalize ? normalizationType : null,
        normalizeTargetLevel: normalize ? normalizeTargetLevel : null,
        includeEffects,
        includeMasterBus,
        fileCount: tracks.length + (includeMasterBus ? 1 : 0),
        status: "pending",
        progress: 0,
        metadata: {
          projectTitle: project.title,
          requestedAt: new Date().toISOString(),
        },
      })
      .returning();

    this.processExportAsync(exportRecord?.id, options, tracks);

    return {
      exportId: exportRecord.id,
      jobId,
      status: "pending",
      statusUrl: `/api/studio/projects/${projectId}/stems/status/${exportRecord?.id}`,
    };
  }

  private async processExportAsync(
    exportId: string,
    options: StemExportOptions,
    tracks: Record<string, unknown>[],
  ): Promise<void> {
    const tempDir = path?.join(os?.tmpdir(), `stem_export_${exportId}`);

    try {
      await fsPromises?.mkdir(tempDir, { recursive: true });

      await db
        .update(stemExports)
        .set({ status: "processing" })
        .where(eq(stemExports.id, exportId));
      // Background job writes bypass invalidateCacheOnMutation() (that
      // middleware only fires on synchronous POST/PUT/PATCH/DELETE HTTP
      // requests). Without this, the client's status-polling GET can keep
      // serving an L1/PDIM-cached snapshot from before this write for up to
      // the cache's TTL, making a genuinely-progressing/completed export
      // look stuck. Bust explicitly after every state-changing write below.
      apiCache?.invalidateForUser(options?.userId);

      const individualFiles: IndividualStemFile[] = [];
      let totalDuration = 0;
      let totalFileSize = 0;
      const totalTracks = tracks?.length + (options?.includeMasterBus ? 1 : 0);

      for (let i = 0; i < tracks?.length; i++) {
        const track = tracks[i];
        await db
          .update(stemExports)
          .set({
            currentTrack: track.name,
          })
          .where(eq(stemExports.id, exportId));
        apiCache?.invalidateForUser(options?.userId);

        try {
          const stemFile = await this.renderTrackStem(track, options, tempDir);

          if (stemFile) {
            individualFiles?.push(stemFile);
            totalDuration += stemFile?.duration;
            totalFileSize += stemFile?.fileSize;
          }
        } catch (error: unknown) {
          logger.warn({ err: error }, `Error rendering track ${track?.name}:`);
        }
      }

      if (options?.includeMasterBus) {
        await db
          .update(stemExports)
          .set({
            currentTrack: "Master Bus",
          })
          .where(eq(stemExports.id, exportId));
        apiCache?.invalidateForUser(options?.userId);

        try {
          const masterFile = await this.renderMasterBus(
            options?.projectId,
            options,
            tempDir,
          );

          if (masterFile) {
            individualFiles?.push(masterFile);
            totalDuration = Math.max(totalDuration, masterFile?.duration);
            totalFileSize += masterFile?.fileSize;
          }
        } catch (error: unknown) {
          logger.warn({ err: error }, "Error rendering master bus:");
        }
      }

      const zipResult = await this.createZipArchive(
        exportId,
        individualFiles,
        options,
        tempDir,
      );

      await db
        .update(stemExports)
        .set({
          status: "completed",
          currentTrack: null,
          individualFiles,
          totalDuration,
          totalFileSize: totalFileSize + zipResult?.zipSize,
          zipArchiveUrl: zipResult.downloadUrl,
          zipStorageKey: zipResult.storageKey,
          completedAt: new Date(),
        })
        .where(eq(stemExports.id, exportId));
      apiCache?.invalidateForUser(options?.userId);

      logger.info(
        `✅ Stem export ${exportId} completed: ${individualFiles?.length} files`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error?.message : "Unknown error occurred";
      logger.warn({ err: error }, `Stem export ${exportId} failed:`);

      await db
        .update(stemExports)
        .set({
          status: "failed",
          errorMessage,
          progress: 0,
          currentTrack: null,
        })
        .where(eq(stemExports.id, exportId));
      apiCache?.invalidateForUser(options?.userId);
    } finally {
      try {
        await fsPromises?.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError: unknown) {
        logger.warn(cleanupError, "Failed to cleanup temp directory:");
      }
    }
  }

  private async renderTrackStem(
    track: Record<string, unknown>,
    options: StemExportOptions,
    tempDir: string,
  ): Promise<IndividualStemFile | null> {
    const clips = await db.query.audioClips.findMany({
      where: eq(audioClips.trackId, track?.id as string),
    });

    if (clips?.length === 0) {
      const emptyFile = await this.createEmptyStem(track, options, tempDir);
      return emptyFile;
    }

    const sanitizedName = this.sanitizeFileName((track?.name as string));
    const extension = this.FORMAT_EXTENSIONS[options?.format];
    const fileName = `${sanitizedName}.${extension}`;
    const outputPath = path?.join(tempDir, fileName);

    try {
      if (clips?.length === 1) {
        await this.renderSingleClip(clips[0], outputPath, options);
      } else {
        await this.mixAndRenderClips(clips, track, outputPath, options);
      }

      if (options?.normalize && options?.normalizationType !== "none") {
        await this.normalizeAudio(outputPath, options);
      }

      const fileBuffer = await fsPromises?.readFile(outputPath);
      const storageKey = await storageService?.uploadGeneratedFile(
        fileBuffer,
        options.userId,
        "stems",
        fileName,
        this.FORMAT_CONTENT_TYPES[options?.format],
      );

      const stats = await fsPromises?.stat(outputPath);
      const duration = await this.getAudioDuration(outputPath);

      return {
        trackId: track.id as string,
        trackName: track.name as string,
        fileName,
        storageKey,
        fileSize: stats.size,
        duration,
      };
    } catch (error: unknown) {
      logger.warn(
        { err: error },
        `Failed to render stem for track ${track?.name}:`,
      );
      return null;
    }
  }

  private async createEmptyStem(
    track: Record<string, unknown>,
    options: StemExportOptions,
    tempDir: string,
  ): Promise<IndividualStemFile> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error(
        "FFmpeg is not available - stem export features are disabled",
      );
    }
    const sanitizedName = this.sanitizeFileName((track?.name as string));
    const extension = this.FORMAT_EXTENSIONS[options?.format];
    const fileName = `${sanitizedName}.${extension}`;
    const outputPath = path?.join(tempDir, fileName);

    // Silence source: raw zeroed PCM samples read from /dev/zero, decoded as
    // signed 16-bit little-endian. This is used instead of the libavfilter
    // "anullsrc" virtual input (-f lavfi) because fluent-ffmpeg's capability
    // probe only parses `ffmpeg -formats`, and current ffmpeg builds list
    // lavfi under `-devices` instead — so fluent-ffmpeg wrongly reports the
    // format as unavailable and refuses to run, even though the real ffmpeg
    // binary supports it. The raw PCM demuxer is a universally-present core
    // ffmpeg format (always listed under `-formats`), and a stream of zero
    // bytes is exact digital silence, so this produces an identical result
    // without depending on lavfi at all.
    const sampleRate = options?.sampleRate || 48000;
    await new Promise<void>((resolve, reject) => {
      (ffmpeg as any)()
        .input("/dev/zero")
        .inputFormat("s16le")
        .inputOptions([`-ar ${sampleRate}`, "-ac 2"])
        .duration(1)
        .audioCodec(this.getAudioCodec(options?.format, options?.bitDepth))
        .audioFrequency(sampleRate)
        .audioChannels(2)
        .outputOptions(this.getOutputOptions(options))
        .on("end", () => resolve())
        .on("error", reject)
        .save(outputPath);
    });

    const fileBuffer = await fsPromises?.readFile(outputPath);
    const storageKey = await storageService?.uploadGeneratedFile(
      fileBuffer,
      options.userId,
      "stems",
      fileName,
      this.FORMAT_CONTENT_TYPES[options?.format],
    );

    const stats = await fsPromises?.stat(outputPath);

    return {
      trackId: track.id as string,
      trackName: track.name as string,
      fileName,
      storageKey,
      fileSize: stats.size,
      duration: 1,
    };
  }

  /**
   * Run the shared ffmpeg encode step against a file that is already on
   * local disk. Factored out so both the single-clip and mixdown paths
   * share one encode implementation instead of drifting independently.
   */
  private async encodeLocalFileToOutput(
    inputPath: string,
    outputPath: string,
    options: StemExportOptions,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let command = (ffmpeg as any)(inputPath)
        .audioCodec(this.getAudioCodec(options?.format, options?.bitDepth))
        .audioFrequency(options?.sampleRate || 48000)
        .audioChannels(2);

      const outputOptions = this.getOutputOptions(options);
      if (outputOptions?.length > 0) {
        command = command?.outputOptions(outputOptions);
      }

      command
        .on("end", () => resolve())
        .on("error", reject)
        .save(outputPath);
    });
  }

  private async renderSingleClip(
    clip: Record<string, unknown>,
    outputPath: string,
    options: StemExportOptions,
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error(
        "FFmpeg is not available - stem export features are disabled",
      );
    }
    // `audio_clips` stores the clip's audio reference in `audioUrl` (an
    // `/api/storage/file/<key>` app route, a legacy bare storage key, or a
    // local/remote URL) — there is no `filePath` column. Resolution of every
    // form is centralized in audioSourceResolver so this stays consistent
    // with the rest of the studio subsystem (render/warp/transient paths).
    if (!clip?.audioUrl) {
      throw new Error("Clip has no audio file");
    }
    const resolved = await resolveAudioUrlToLocalFile(clip.audioUrl as string, options.userId);
    try {
      await this.encodeLocalFileToOutput(resolved.localPath, outputPath, options);
    } finally {
      await resolved.cleanup();
    }
  }

  private async mixAndRenderClips(
    clips: unknown[],
    _track: Record<string, unknown>,
    outputPath: string,
    options: StemExportOptions,
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error(
        "FFmpeg is not available - stem export features are disabled",
      );
    }
    const resolvedClips: { localPath: string; cleanup: () => Promise<void> }[] = [];

    for (const clip of clips) {
      const audioUrl = (clip as any)?.audioUrl;
      if (!audioUrl) continue;
      try {
        resolvedClips?.push(await resolveAudioUrlToLocalFile(audioUrl, options.userId));
      } catch (error: unknown) {
        // Documented lenient-skip: one unresolvable clip among many
        // shouldn't fail the whole track mixdown.
        logger.warn(
          { err: error },
          `Skipping unresolvable clip ${(clip as any)?.id} during mixdown:`,
        );
      }
    }

    try {
      if (resolvedClips?.length === 0) {
        throw new Error("No clip audio files found");
      }

      if (resolvedClips?.length === 1) {
        await this.encodeLocalFileToOutput(
          resolvedClips[0].localPath,
          outputPath,
          options,
        );
        return;
      }

      await new Promise<void>((resolve, reject) => {
        let command = (ffmpeg as any)!();

        resolvedClips?.forEach(({ localPath }) => {
          command = command?.input(localPath);
        });

        const filterComplex =
          resolvedClips?.map((_, i) => `[${i}:a]`).join("") +
          `amix=inputs=${resolvedClips.length}:duration=longest:dropout_transition=0`;

        command
          .complexFilter(filterComplex)
          .audioCodec(this.getAudioCodec(options?.format, options?.bitDepth))
          .audioFrequency(options?.sampleRate || 48000)
          .audioChannels(2)
          .outputOptions(this.getOutputOptions(options))
          .on("end", () => resolve())
          .on("error", reject)
          .save(outputPath);
      });
    } finally {
      await Promise.all(resolvedClips?.map((rc) => rc.cleanup()));
    }
  }

  private async renderMasterBus(
    projectId: string,
    options: StemExportOptions,
    tempDir: string,
  ): Promise<IndividualStemFile | null> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      throw new Error(
        "FFmpeg is not available - stem export features are disabled",
      );
    }
    const tracks = await db.query.studioTracks.findMany({
      where: and(
        eq(studioTracks.projectId, projectId),
        eq(studioTracks.isMuted, false),
      ),
    });

    if (tracks?.length === 0) {
      return null;
    }

    const trackStemPaths: string[] = [];
    const trackVolumes: number[] = [];
    const masterCleanups: (() => Promise<void>)[] = [];

    for (const track of tracks) {
      const clips = await db.query.audioClips.findMany({
        where: eq(audioClips.trackId, track?.id),
      });

      const audioUrl = (clips[0] as any)?.audioUrl;
      if (clips?.length > 0 && audioUrl) {
        try {
          const resolved = await resolveAudioUrlToLocalFile(audioUrl, options.userId);
          trackStemPaths?.push(resolved.localPath);
          trackVolumes?.push(track?.volume || 0.8);
          masterCleanups?.push(resolved.cleanup);
        } catch (error: unknown) {
          logger.warn(
            { err: error },
            `Skipping unresolvable clip for track ${track?.id} during master bus render:`,
          );
          continue;
        }
      }
    }

    if (trackStemPaths?.length === 0) {
      return null;
    }

    const extension = this.FORMAT_EXTENSIONS[options?.format];
    const fileName = `Master.${extension}`;
    const outputPath = path?.join(tempDir, fileName);

    try {
      await new Promise<void>((resolve, reject) => {
        let command = (ffmpeg as any)!();

        trackStemPaths?.forEach((stemPath) => {
          command = command?.input(stemPath);
        });

        const filterParts = trackStemPaths?.map(
          (_, i) => `[${i}:a]volume=${trackVolumes[i]}[a${i}]`,
        );
        const mixInputs = trackStemPaths?.map((_, i) => `[a${i}]`).join("");
        const mixFilter = `${mixInputs}amix=inputs=${trackStemPaths.length}:duration=longest:normalize=0`;

        filterParts?.push(mixFilter);

        command
          .complexFilter(filterParts?.join(";"))
          .audioCodec(this.getAudioCodec(options?.format, options?.bitDepth))
          .audioFrequency(options?.sampleRate || 48000)
          .audioChannels(2)
          .outputOptions(this.getOutputOptions(options))
          .on("end", () => resolve())
          .on("error", reject)
          .save(outputPath);
      });
    } finally {
      await Promise.all(masterCleanups?.map((cleanup) => cleanup()));
    }

    if (options?.normalize && options?.normalizationType !== "none") {
      await this.normalizeAudio(outputPath, options);
    }

    const fileBuffer = await fsPromises?.readFile(outputPath);
    const storageKey = await storageService?.uploadGeneratedFile(
      fileBuffer,
      options.userId,
      "stems",
      fileName,
      this.FORMAT_CONTENT_TYPES[options?.format],
    );

    const stats = await fsPromises?.stat(outputPath);
    const duration = await this.getAudioDuration(outputPath);

    return {
      trackId: "master",
      trackName: "Master",
      fileName,
      storageKey,
      fileSize: stats.size,
      duration,
    };
  }

  private async normalizeAudio(
    filePath: string,
    options: StemExportOptions,
  ): Promise<void> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg) {
      logger.warn("FFmpeg not available - skipping audio normalization");
      return;
    }
    const { normalizationType, normalizeTargetLevel = -14 } = options;
    const tempPath = filePath + ".normalized.tmp";

    let filterOptions: string;

    switch (normalizationType) {
      case "peak":
        filterOptions = `loudnorm=I=${normalizeTargetLevel}:TP=-1.5:LRA=11`;
        break;
      case "rms":
        filterOptions = `volume=enable='1':volume=${Math.pow(10, normalizeTargetLevel / 20)}`;
        break;
      case "lufs":
        filterOptions = `loudnorm=I=${normalizeTargetLevel}:TP=-1.5:LRA=7`;
        break;
      default:
        return;
    }

    await new Promise<void>((resolve, reject) => {
      (ffmpeg as any)(filePath)
        .audioFilters(filterOptions)
        .audioCodec(this.getAudioCodec(options?.format, options?.bitDepth))
        .audioFrequency(options?.sampleRate || 48000)
        .outputOptions(this.getOutputOptions(options))
        .on("end", () => resolve())
        .on("error", reject)
        .save(tempPath);
    });

    await fsPromises?.rename(tempPath, filePath);
  }

  private async createZipArchive(
    exportId: string,
    files: IndividualStemFile[],
    _options: StemExportOptions,
    tempDir: string,
  ): Promise<{ storageKey: string; downloadUrl: string; zipSize: number }> {
    const zipFileName = `stems_${exportId}.zip`;
    const zipPath = path?.join(tempDir, zipFileName);

    await new Promise<void>((resolve, reject) => {
      const output = fs?.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 6 } });

      output?.on("close", () => resolve());
      output?.on("error", reject);
      archive?.on("error", reject);

      archive?.pipe(output);

      for (const file of files) {
        const filePath = path?.join(tempDir, file?.fileName);
        if (fs?.existsSync(filePath)) {
          archive?.file(filePath, { name: file.fileName });
        }
      }

      archive?.finalize();
    });

    const zipBuffer = await fsPromises?.readFile(zipPath);
    const storageKey = await storageService?.uploadGeneratedFile(
      zipBuffer,
      _options.userId,
      "exports",
      zipFileName,
      "application/zip",
    );

    const downloadUrl = await storageService?.getDownloadUrl(storageKey);
    const stats = await fsPromises?.stat(zipPath);

    return {
      storageKey,
      downloadUrl,
      zipSize: stats.size,
    };
  }

  private getAudioCodec(format: ExportFormat, bitDepth?: BitDepth): string {
    switch (format) {
      case "wav":
        if (bitDepth === 32) return "pcm_f32le";
        if (bitDepth === 24) return "pcm_s24le";
        return "pcm_s16le";
      case "flac":
        return "flac";
      case "mp3":
        return "libmp3lame";
      case "aac":
        return "aac";
      default:
        return "pcm_s24le";
    }
  }

  private getOutputOptions(options: StemExportOptions): string[] {
    const outputOptions: string[] = [];

    if (options?.format === "mp3" || options?.format === "aac") {
      outputOptions?.push(`-b:a`, options?.bitrate || "320k");
    }

    if (options?.format === "flac") {
      outputOptions?.push("-compression_level", "8");
    }

    return outputOptions;
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    const hasFFmpeg = await initializeFfmpeg();
    if (!hasFFmpeg || !ffmpeg) {
      logger.warn("FFmpeg not available - returning default duration");
      return 0;
    }
    return new Promise((resolve, _reject) => {
      (ffmpeg as any)?.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) {
          resolve(0);
          return;
        }
        resolve(parseFloat(metadata?.format.duration || "0"));
      });
    });
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s\-_]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 100);
  }

  async getExportStatus(exportId: string, userId: string): Promise<unknown> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error("Export not found");
    }

    return {
      id: exportRecord.id,
      status: exportRecord.status,
      progress: (exportRecord as any).progress,
      currentTrack: (exportRecord as any).currentTrack,
      fileCount: (exportRecord as any).fileCount,
      format: (exportRecord as any).exportFormat,
      sampleRate: exportRecord.sampleRate,
      bitDepth: exportRecord.bitDepth,
      normalize: (exportRecord as any).normalize,
      normalizationType: (exportRecord as any).normalizationType,
      includeEffects: (exportRecord as any).includeEffects,
      includeMasterBus: (exportRecord as any).includeMasterBus,
      totalDuration: (exportRecord as any).totalDuration,
      totalFileSize: (exportRecord as any).totalFileSize,
      individualFiles: (exportRecord as any).individualFiles,
      zipArchiveUrl: (exportRecord as any).zipArchiveUrl,
      errorMessage: (exportRecord as any).errorMessage,
      createdAt: exportRecord.createdAt,
      completedAt: (exportRecord as any).completedAt,
    };
  }

  async getExportDownload(
    exportId: string,
    userId: string,
  ): Promise<{
    downloadUrl: string;
    storageKey: string;
    fileName: string;
    fileSize: number;
  }> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error("Export not found");
    }

    if (exportRecord?.status !== "completed") {
      throw new Error("Export is not ready for download");
    }

    if ((!exportRecord as any)?.zipStorageKey) {
      throw new Error("Export file not found");
    }

    const storageKey = (exportRecord as any)?.zipStorageKey as string;
    const downloadUrl = await storageService?.getDownloadUrl(storageKey);

    return {
      downloadUrl,
      storageKey,
      fileName: `${(exportRecord as any)?.exportName || "stems"}.zip`,
      fileSize: Number((exportRecord as any)?.totalFileSize) || 0,
    };
  }

  async listExports(
    projectId: string,
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ exports: unknown[]; total: number }> {
    const { limit = 20, offset = 0 } = options || {};

    const exports = await db.query.stemExports.findMany({
      where: and(
        eq(stemExports.projectId, projectId),
        eq(stemExports.userId, userId),
      ),
      orderBy: (exports, { desc }) => [desc(exports?.createdAt)],
      limit,
      offset,
    });

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(stemExports)
      .where(
        and(
          eq(stemExports.projectId, projectId),
          eq(stemExports.userId, userId),
        ),
      );

    return {
      exports: exports.map((exp) => ({
        id: exp.id,
        exportName: (exp as any).exportName,
        status: exp.status,
        format: (exp as any).exportFormat,
        fileCount: (exp as any).fileCount,
        totalFileSize: (exp as any).totalFileSize,
        progress: (exp as any).progress,
        createdAt: exp.createdAt,
        completedAt: (exp as any).completedAt,
      })),
      total: Number(totalResult[0]?.count) || 0,
    };
  }

  async deleteExport(exportId: string, userId: string): Promise<void> {
    const exportRecord = await db.query.stemExports.findFirst({
      where: and(eq(stemExports.id, exportId), eq(stemExports.userId, userId)),
    });

    if (!exportRecord) {
      throw new Error("Export not found");
    }

    if ((exportRecord as any)?.zipStorageKey) {
      try {
        await storageService?.deleteFile((exportRecord as any)?.zipStorageKey);
      } catch (error: unknown) {
        logger.warn({ err: error }, "Failed to delete ZIP file:");
      }
    }

    const files = (exportRecord as any)?.individualFiles as IndividualStemFile[] | null;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        try {
          await storageService?.deleteFile(file?.storageKey);
        } catch (error: unknown) {
          logger.warn(
            { err: error },
            `Failed to delete stem file ${file?.fileName}:`,
          );
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
      throw new Error("Export not found");
    }

    if (
      exportRecord?.status === "completed" ||
      exportRecord?.status === "failed"
    ) {
      throw new Error("Cannot cancel a completed or failed export");
    }

    await db
      .update(stemExports)
      .set({
        status: "failed",
        errorMessage: "Export cancelled by user",
        progress: 0,
      })
      .where(eq(stemExports.id, exportId));
  }
}

import { sql } from "drizzle-orm";

export const stemExportService = new StemExportService();
