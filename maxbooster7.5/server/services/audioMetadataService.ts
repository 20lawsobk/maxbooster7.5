import * as musicMetadata from 'music-metadata';
import { logger } from '../logger.js';

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  track?: { no: number | null; of: number | null };
  disk?: { no: number | null; of: number | null };
  genre?: string[];
  comment?: string[];
  composer?: string[];
  albumArtist?: string;
  copyright?: string;
  label?: string;
  isrc?: string;
  bpm?: number;
  key?: string;
  duration: number;
  sampleRate: number;
  bitrate?: number;
  channels: number;
  codec: string;
  codecProfile?: string;
  container: string;
  lossless: boolean;
  bitDepth?: number;
  tagTypes: string[];
  hasCoverArt: boolean;
  coverArt?: {
    format: string;
    type?: string;
    description?: string;
    data?: Buffer;
  };
}

export interface AudioFormatInfo {
  format: string;
  codec: string;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
  bitrate?: number;
  duration: number;
  lossless: boolean;
  quality: 'low' | 'standard' | 'high' | 'lossless' | 'hi-res';
}

export const SUPPORTED_AUDIO_FORMATS = {
  lossy: ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'webm'],
  lossless: ['wav', 'flac', 'aiff', 'alac', 'ape', 'wv', 'dsd'],
  containers: ['mp4', 'm4a', 'ogg', 'webm', 'mkv', 'avi', 'mov'],
} as const;

export const QUALITY_THRESHOLDS = {
  hiRes: { sampleRate: 96000, bitDepth: 24 },
  lossless: { sampleRate: 44100, bitDepth: 16 },
  high: { bitrate: 256 },
  standard: { bitrate: 128 },
} as const;

class AudioMetadataService {
  private static instance: AudioMetadataService;

  static getInstance(): AudioMetadataService {
    if (!AudioMetadataService.instance) {
      AudioMetadataService.instance = new AudioMetadataService();
    }
    return AudioMetadataService.instance;
  }

  async extractMetadata(buffer: Buffer, mimeType?: string): Promise<AudioMetadata> {
    try {
      const metadata = await musicMetadata.parseBuffer(buffer, { mimeType });
      const { format, common } = metadata;

      const hasCoverArt = common.picture && common.picture.length > 0;
      let coverArt: AudioMetadata['coverArt'] | undefined;

      if (hasCoverArt && common.picture) {
        const pic = common.picture[0];
        coverArt = {
          format: pic.format,
          type: pic.type,
          description: pic.description,
          data: pic.data,
        };
      }

      return {
        title: common.title,
        artist: common.artist,
        album: common.album,
        year: common.year,
        track: common.track,
        disk: common.disk,
        genre: common.genre,
        comment: common.comment,
        composer: common.composer,
        albumArtist: common.albumartist,
        copyright: common.copyright,
        label: common.label?.[0],
        isrc: common.isrc?.[0],
        bpm: common.bpm,
        key: common.key,
        duration: format.duration || 0,
        sampleRate: format.sampleRate || 44100,
        bitrate: format.bitrate,
        channels: format.numberOfChannels || 2,
        codec: format.codec || 'unknown',
        codecProfile: format.codecProfile,
        container: format.container || 'unknown',
        lossless: format.lossless || false,
        bitDepth: format.bitsPerSample,
        tagTypes: format.tagTypes || [],
        hasCoverArt,
        coverArt,
      };
    } catch (error) {
      logger.error('Error extracting audio metadata:', error);
      throw new Error('Failed to extract audio metadata');
    }
  }

  async extractFromStream(stream: NodeJS.ReadableStream, mimeType?: string): Promise<AudioMetadata> {
    try {
      const metadata = await musicMetadata.parseStream(stream, { mimeType });
      const { format, common } = metadata;

      return {
        title: common.title,
        artist: common.artist,
        album: common.album,
        year: common.year,
        track: common.track,
        disk: common.disk,
        genre: common.genre,
        comment: common.comment,
        composer: common.composer,
        albumArtist: common.albumartist,
        copyright: common.copyright,
        label: common.label?.[0],
        isrc: common.isrc?.[0],
        bpm: common.bpm,
        key: common.key,
        duration: format.duration || 0,
        sampleRate: format.sampleRate || 44100,
        bitrate: format.bitrate,
        channels: format.numberOfChannels || 2,
        codec: format.codec || 'unknown',
        codecProfile: format.codecProfile,
        container: format.container || 'unknown',
        lossless: format.lossless || false,
        bitDepth: format.bitsPerSample,
        tagTypes: format.tagTypes || [],
        hasCoverArt: !!(common.picture && common.picture.length > 0),
      };
    } catch (error) {
      logger.error('Error extracting audio metadata from stream:', error);
      throw new Error('Failed to extract audio metadata');
    }
  }

  analyzeFormat(metadata: AudioMetadata): AudioFormatInfo {
    let quality: AudioFormatInfo['quality'];

    if (metadata.lossless) {
      if (metadata.sampleRate >= QUALITY_THRESHOLDS.hiRes.sampleRate ||
          (metadata.bitDepth && metadata.bitDepth >= QUALITY_THRESHOLDS.hiRes.bitDepth)) {
        quality = 'hi-res';
      } else {
        quality = 'lossless';
      }
    } else if (metadata.bitrate) {
      if (metadata.bitrate >= QUALITY_THRESHOLDS.high.bitrate * 1000) {
        quality = 'high';
      } else if (metadata.bitrate >= QUALITY_THRESHOLDS.standard.bitrate * 1000) {
        quality = 'standard';
      } else {
        quality = 'low';
      }
    } else {
      quality = 'standard';
    }

    return {
      format: metadata.container,
      codec: metadata.codec,
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
      bitDepth: metadata.bitDepth,
      bitrate: metadata.bitrate,
      duration: metadata.duration,
      lossless: metadata.lossless,
      quality,
    };
  }

  isDistributionReady(metadata: AudioMetadata): { ready: boolean; issues: string[] } {
    const issues: string[] = [];

    if (metadata.sampleRate < 44100) {
      issues.push(`Sample rate ${metadata.sampleRate}Hz is below distribution minimum (44.1kHz)`);
    }

    if (metadata.bitDepth && metadata.bitDepth < 16) {
      issues.push(`Bit depth ${metadata.bitDepth}-bit is below distribution minimum (16-bit)`);
    }

    if (!metadata.lossless && metadata.bitrate && metadata.bitrate < 128000) {
      issues.push(`Bitrate ${Math.round(metadata.bitrate / 1000)}kbps is below recommended minimum (128kbps)`);
    }

    if (metadata.channels < 1 || metadata.channels > 8) {
      issues.push(`Channel count ${metadata.channels} is not supported for distribution`);
    }

    if (metadata.duration < 1) {
      issues.push('Audio duration is too short for distribution');
    }

    return {
      ready: issues.length === 0,
      issues,
    };
  }

  validateForPlatform(metadata: AudioMetadata, platform: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    const requirements: Record<string, { minSampleRate: number; minBitrate: number; maxDuration?: number }> = {
      spotify: { minSampleRate: 44100, minBitrate: 96000 },
      appleMusic: { minSampleRate: 44100, minBitrate: 256000 },
      youtube: { minSampleRate: 44100, minBitrate: 128000 },
      tiktok: { minSampleRate: 44100, minBitrate: 128000, maxDuration: 180 },
      instagram: { minSampleRate: 44100, minBitrate: 128000, maxDuration: 60 },
    };

    const req = requirements[platform.toLowerCase()];
    if (!req) {
      return { valid: true, issues: [] };
    }

    if (metadata.sampleRate < req.minSampleRate) {
      issues.push(`Sample rate ${metadata.sampleRate}Hz is below ${platform} minimum (${req.minSampleRate}Hz)`);
    }

    if (!metadata.lossless && metadata.bitrate && metadata.bitrate < req.minBitrate) {
      issues.push(`Bitrate ${Math.round(metadata.bitrate / 1000)}kbps is below ${platform} minimum (${req.minBitrate / 1000}kbps)`);
    }

    if (req.maxDuration && metadata.duration > req.maxDuration) {
      issues.push(`Duration ${Math.round(metadata.duration)}s exceeds ${platform} maximum (${req.maxDuration}s)`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  getFormatRecommendations(metadata: AudioMetadata): string[] {
    const recommendations: string[] = [];

    if (!metadata.lossless && metadata.sampleRate === 44100) {
      recommendations.push('Consider using lossless format (WAV/FLAC) for best distribution quality');
    }

    if (metadata.lossless && metadata.sampleRate > 48000) {
      recommendations.push('Hi-res audio detected - great for audiophile platforms');
    }

    if (!metadata.hasCoverArt) {
      recommendations.push('No cover art embedded - consider adding artwork before distribution');
    }

    if (!metadata.title || !metadata.artist) {
      recommendations.push('Missing title or artist metadata - ensure proper tagging before distribution');
    }

    if (!metadata.isrc) {
      recommendations.push('No ISRC code - this will be assigned during distribution');
    }

    return recommendations;
  }
}

export const audioMetadataService = AudioMetadataService.getInstance();
