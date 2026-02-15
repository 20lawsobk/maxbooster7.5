import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import type { IStorage } from '../storage';
import { logger } from '../logger.js';

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
    logger.warn('FFmpeg not available - audio conversion features will be limited:', error);
    return false;
  }
}

// Quality presets mapping for different formats and quality levels
const qualityPresets = {
  low: {
    mp3: 128000,
    aac: 96000,
    ogg: 96000,
    m4a: 96000,
    sampleRate: 44100,
  },
  medium: {
    mp3: 192000,
    aac: 128000,
    ogg: 128000,
    m4a: 128000,
    sampleRate: 44100,
  },
  high: {
    mp3: 320000,
    aac: 256000,
    ogg: 256000,
    m4a: 256000,
    sampleRate: 48000,
  },
  lossless: {
    flac: 0,
    wav: 0,
    sampleRate: 48000,
  },
};

// Track active FFmpeg processes for cancellation
const activeProcesses = new Map<string, any>();

// Conversion queue (limit to 2 concurrent conversions to prevent CPU overload)
const conversionQueue = new Map<string, Promise<void>>();
const MAX_CONCURRENT_CONVERSIONS = 2;

/**
 * Sanitize file path to prevent directory traversal attacks
 */
/**
 * TODO: Add function documentation
 */
function sanitizePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Invalid file path');
  }
  return normalized;
}

/**
 * Get quality settings based on format and preset
 */
/**
 * TODO: Add function documentation
 */
function getQualitySettings(
  format: string,
  preset: string
): { bitrate?: number; sampleRate: number } {
  const presetConfig = qualityPresets[preset as keyof typeof qualityPresets];
  if (!presetConfig) {
    throw new Error(`Invalid quality preset: ${preset}`);
  }

  const formatLower = format.toLowerCase();
  let bitrate: number | undefined;

  if (preset === 'lossless') {
    if (formatLower !== 'flac' && formatLower !== 'wav') {
      throw new Error('Lossless preset only supports FLAC and WAV formats');
    }
    bitrate = undefined; // Lossless = no bitrate limit
  } else {
    bitrate = presetConfig[formatLower as keyof typeof presetConfig.low] as number;
    if (!bitrate) {
      throw new Error(`Format ${format} not supported for preset ${preset}`);
    }
  }

  return {
    bitrate,
    sampleRate: presetConfig.sampleRate,
  };
}

/**
 * Convert audio file using FFmpeg
 */
/**
 * TODO: Add function documentation
 */
export async function convertAudioFile(
  conversionId: string,
  sourcePath: string,
  targetFormat: string,
  qualityPreset: string,
  projectId: string,
  storage: IStorage
): Promise<string> {
  const hasFFmpeg = await initializeFfmpeg();
  if (!hasFFmpeg || !ffmpeg) {
    throw new Error('FFmpeg is not available. Audio conversion features are disabled in this deployment.');
  }
  try {
    // Sanitize and validate source path
    const sanitizedSource = sanitizePath(sourcePath);
    const fullSourcePath = path.join(process.cwd(), sanitizedSource);

    // Validate source file exists
    if (!existsSync(fullSourcePath)) {
      throw new Error(`Source file not found: ${sanitizedSource}`);
    }

    // Get quality settings
    const { bitrate, sampleRate } = getQualitySettings(targetFormat, qualityPreset);

    // Create output directory: uploads/conversions/<projectId>/
    const outputDir = path.join(process.cwd(), 'uploads', 'conversions', projectId);
    await fs.mkdir(outputDir, { recursive: true });

    // Generate output filename
    const sourceBasename = path.basename(sanitizedSource, path.extname(sanitizedSource));
    const timestamp = Date.now();
    const outputFilename = `${sourceBasename}_${timestamp}.${targetFormat.toLowerCase()}`;
    const outputPath = path.join(outputDir, outputFilename);
    const relativeOutputPath = path.relative(process.cwd(), outputPath);

    // Configure FFmpeg command
    const command = ffmpeg(fullSourcePath)
      .audioFrequency(sampleRate)
      .format(targetFormat.toLowerCase());

    // Apply format-specific settings
    const formatLower = targetFormat.toLowerCase();
    if (bitrate) {
      command.audioBitrate(bitrate / 1000); // FFmpeg expects kbps
    }

    // Format-specific codec and quality settings
    switch (formatLower) {
      case 'mp3':
        command.audioCodec('libmp3lame');
        if (qualityPreset === 'high') {
          command.audioQuality(0); // VBR quality 0 (highest)
        }
        break;
      case 'aac':
      case 'm4a':
        command.audioCodec('aac');
        break;
      case 'ogg':
        command.audioCodec('libvorbis');
        break;
      case 'flac':
        command.audioCodec('flac');
        command.audioChannels(2); // Stereo
        break;
      case 'wav':
        command.audioCodec('pcm_s16le');
        command.audioChannels(2);
        break;
      default:
        throw new Error(`Unsupported format: ${targetFormat}`);
    }

    // Execute conversion with progress tracking
    return new Promise((resolve, reject) => {
      let duration: number = 0;

      command
        .on('codecData', (data: unknown) => {
          // Get total duration for progress calculation
          if (data.duration) {
            const timeParts = data.duration.split(':');
            duration =
              parseInt(timeParts[0]) * 3600 +
              parseInt(timeParts[1]) * 60 +
              parseFloat(timeParts[2]);
          }
        })
        .on('progress', async (progress: unknown) => {
          if (duration > 0 && progress.timemark) {
            const timeParts = progress.timemark.split(':');
            const currentTime =
              parseInt(timeParts[0]) * 3600 +
              parseInt(timeParts[1]) * 60 +
              parseFloat(timeParts[2]);
            const percentage = Math.min(Math.round((currentTime / duration) * 100), 99);

            // Update progress in database
            try {
              await storage.updateConversion(conversionId, { progress: percentage });
            } catch (err: unknown) {
              logger.error('Failed to update conversion progress:', err);
            }
          }
        })
        .on('end', async () => {
          // Update to 100% and mark as completed
          try {
            await storage.updateConversion(conversionId, {
              progress: 100,
              status: 'completed',
              outputFilePath: relativeOutputPath,
              completedAt: new Date(),
            });
            activeProcesses.delete(conversionId);
            resolve(relativeOutputPath);
          } catch (err: unknown) {
            reject(err);
          }
        })
        .on('error', async (err: Error) => {
          // Update status to failed with error message
          try {
            await storage.updateConversion(conversionId, {
              status: 'failed',
              errorMessage: err.message,
              completedAt: new Date(),
            });
          } catch (updateErr: unknown) {
            logger.error('Failed to update conversion error:', updateErr);
          }
          activeProcesses.delete(conversionId);
          reject(err);
        })
        .save(outputPath);

      // Store process for potential cancellation
      activeProcesses.set(conversionId, command);
    });
  } catch (error: unknown) {
    // Update database with error
    await storage.updateConversion(conversionId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Process a conversion job
 */
/**
 * TODO: Add function documentation
 */
export async function processConversion(conversionId: string, storage: IStorage): Promise<void> {
  try {
    // Get conversion details from database
    const conversion = await storage.getConversion(conversionId);
    if (!conversion) {
      throw new Error(`Conversion ${conversionId} not found`);
    }

    // Check if already processing or completed
    if (conversion.status !== 'pending') {
      logger.info(`Conversion ${conversionId} already ${conversion.status}, skipping`);
      return;
    }

    // Update status to processing
    await storage.updateConversion(conversionId, { status: 'processing' });

    // Execute conversion
    await convertAudioFile(
      conversionId,
      conversion.sourceFilePath,
      conversion.targetFormat,
      conversion.qualityPreset,
      conversion.projectId,
      storage
    );

    logger.info(`Conversion ${conversionId} completed successfully`);
  } catch (error: unknown) {
    logger.error(`Conversion ${conversionId} failed:`, error);
    throw error;
  } finally {
    // Remove from queue
    conversionQueue.delete(conversionId);
  }
}

/**
 * Add conversion to queue and start processing if slot available
 */
/**
 * TODO: Add function documentation
 */
export async function enqueueConversion(conversionId: string, storage: IStorage): Promise<void> {
  // Check if already in queue
  if (conversionQueue.has(conversionId)) {
    throw new Error('Conversion already queued');
  }

  // Wait if queue is full
  while (conversionQueue.size >= MAX_CONCURRENT_CONVERSIONS) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Add to queue and start processing
  const promise = processConversion(conversionId, storage);
  conversionQueue.set(conversionId, promise);

  // Don't await - let it process in background
  promise.catch((err) => {
    logger.error(`Background conversion ${conversionId} error:`, err);
  });
}

/**
 * Cancel an active conversion
 */
/**
 * TODO: Add function documentation
 */
export async function cancelConversion(conversionId: string, storage: IStorage): Promise<void> {
  // Kill FFmpeg process if active
  const process = activeProcesses.get(conversionId);
  if (process) {
    try {
      process.kill('SIGKILL');
      activeProcesses.delete(conversionId);
    } catch (err: unknown) {
      logger.error(`Failed to kill conversion process ${conversionId}:`, err);
    }
  }

  // Update database status
  await storage.updateConversion(conversionId, {
    status: 'cancelled',
    completedAt: new Date(),
  });

  // Remove from queue
  conversionQueue.delete(conversionId);

  // Clean up partial output file if it exists
  const conversion = await storage.getConversion(conversionId);
  if (conversion?.outputFilePath) {
    try {
      const fullPath = path.join(process.cwd(), conversion.outputFilePath);
      if (existsSync(fullPath)) {
        await fs.unlink(fullPath);
      }
    } catch (err: unknown) {
      logger.error(`Failed to delete partial file for ${conversionId}:`, err);
    }
  }
}

/**
 * Get current queue status
 */
/**
 * TODO: Add function documentation
 */
export function getQueueStatus(): { active: number; max: number } {
  return {
    active: conversionQueue.size,
    max: MAX_CONCURRENT_CONVERSIONS,
  };
}
