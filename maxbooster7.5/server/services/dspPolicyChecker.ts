import { logger } from '../logger.js';
import path from 'path';
import fs from 'fs';

// Optional sharp support with graceful fallback
let sharpModule: any = null;
let sharpAvailable = false;

async function getSharp() {
  if (sharpModule !== null) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
    sharpAvailable = true;
    logger.info('Sharp module loaded for DSP policy checking');
    return sharpModule;
  } catch (error) {
    logger.warn('Sharp not available - cover art validation will use basic checks');
    sharpModule = false;
    return null;
  }
}

// Initialize on module load
getSharp().catch(() => {});

export interface CoverArtPolicy {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  aspectRatio: string;
  formats: string[];
  maxFileSize: number;
  colorMode: string[];
  minDPI: number;
  bannedContent: string[];
}

export interface AudioPolicy {
  formats: string[];
  minBitDepth: number;
  maxBitDepth: number;
  sampleRates: number[];
  minDuration: number;
  maxDuration: number;
  loudnessTargetLUFS: number;
  truePeakMax: number;
}

export interface MetadataPolicy {
  maxTitleLength: number;
  maxArtistLength: number;
  maxAlbumArtistLength: number;
  maxLabelLength: number;
  maxGenreLength: number;
  maxLyricsLength: number;
  allowedCharacters: string;
  requiredFields: string[];
  bannedTerms: string[];
}

export interface ReleaseTimingPolicy {
  minLeadTime: number;
  maxFutureDate: number;
  preferredReleaseDay: number;
  blackoutDates: string[];
  timezone: string;
}

export interface DSPPolicy {
  id: string;
  name: string;
  coverArt: CoverArtPolicy;
  audio: AudioPolicy;
  metadata: MetadataPolicy;
  releaseTiming: ReleaseTimingPolicy;
  additionalRequirements: string[];
}

export interface ComplianceResult {
  dsp: string;
  compliant: boolean;
  errors: ComplianceError[];
  warnings: ComplianceWarning[];
  checkedAt: Date;
}

export interface ComplianceError {
  category: 'coverArt' | 'audio' | 'metadata' | 'timing';
  field: string;
  message: string;
  requirement: string;
  currentValue?: string | number;
}

export interface ComplianceWarning {
  category: 'coverArt' | 'audio' | 'metadata' | 'timing';
  field: string;
  message: string;
  suggestion: string;
}

export interface ReleaseToCheck {
  title: string;
  artist: string;
  albumArtist?: string;
  label?: string;
  genre?: string;
  releaseDate?: Date | string;
  coverArtPath?: string;
  coverArtUrl?: string;
  coverArtMetadata?: {
    width?: number;
    height?: number;
    format?: string;
    fileSize?: number;
  };
  audioFiles?: {
    path: string;
    format?: string;
    bitDepth?: number;
    sampleRate?: number;
    duration?: number;
    loudnessLUFS?: number;
    truePeak?: number;
  }[];
  tracks?: {
    title: string;
    artist?: string;
    lyrics?: string;
    duration?: number;
  }[];
}

export const DSP_POLICIES: { [key: string]: DSPPolicy } = {
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    coverArt: {
      minWidth: 3000,
      maxWidth: 3000,
      minHeight: 3000,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB', 'sRGB'],
      minDPI: 72,
      bannedContent: ['text', 'logos', 'promotional', 'website urls', 'social handles', 'explicit imagery', 'low quality', 'blurry']
    },
    audio: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000, 88200, 96000],
      minDuration: 30,
      maxDuration: 3600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 200,
      maxArtistLength: 100,
      maxAlbumArtistLength: 100,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'genre', 'releaseDate', 'coverArt', 'isrc'],
      bannedTerms: ['karaoke', 'tribute', 'cover version', 'soundalike', 'in the style of']
    },
    releaseTiming: {
      minLeadTime: 7,
      maxFutureDate: 365,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'UTC'
    },
    additionalRequirements: [
      'ISRC required for each track',
      'UPC/EAN required for release',
      'Explicit content must be flagged',
      'Lyrics must match audio content'
    ]
  },
  appleMusic: {
    id: 'appleMusic',
    name: 'Apple Music',
    coverArt: {
      minWidth: 3000,
      maxWidth: 4096,
      minHeight: 3000,
      maxHeight: 4096,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 40 * 1024 * 1024,
      colorMode: ['RGB', 'sRGB'],
      minDPI: 72,
      bannedContent: ['text', 'explicit imagery', 'copyrighted content', 'pixelated images']
    },
    audio: {
      formats: ['wav', 'flac', 'aiff'],
      minBitDepth: 16,
      maxBitDepth: 32,
      sampleRates: [44100, 48000, 88200, 96000, 176400, 192000],
      minDuration: 1,
      maxDuration: 7200,
      loudnessTargetLUFS: -16,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 256,
      maxArtistLength: 256,
      maxAlbumArtistLength: 256,
      maxLabelLength: 256,
      maxGenreLength: 50,
      maxLyricsLength: 100000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'genre', 'releaseDate', 'coverArt', 'isrc', 'copyright'],
      bannedTerms: ['karaoke', 'tribute', 'cover', 'sound-alike']
    },
    releaseTiming: {
      minLeadTime: 14,
      maxFutureDate: 365,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'America/Los_Angeles'
    },
    additionalRequirements: [
      'Mastered for iTunes (MFiT) format preferred',
      'Dolby Atmos supported',
      'Spatial Audio metadata optional',
      'Lyrics sync timing supported'
    ]
  },
  amazonMusic: {
    id: 'amazonMusic',
    name: 'Amazon Music',
    coverArt: {
      minWidth: 3000,
      maxWidth: 3000,
      minHeight: 3000,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB'],
      minDPI: 72,
      bannedContent: ['text', 'promotional content', 'explicit imagery']
    },
    audio: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 30,
      maxDuration: 3600,
      loudnessTargetLUFS: -14,
      truePeakMax: -2
    },
    metadata: {
      maxTitleLength: 250,
      maxArtistLength: 250,
      maxAlbumArtistLength: 250,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'genre', 'releaseDate', 'coverArt'],
      bannedTerms: ['karaoke', 'tribute', 'cover version']
    },
    releaseTiming: {
      minLeadTime: 7,
      maxFutureDate: 180,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'America/Los_Angeles'
    },
    additionalRequirements: [
      'UHD audio supported for HD tier',
      'Alexa integration metadata optional'
    ]
  },
  youtubeMusic: {
    id: 'youtubeMusic',
    name: 'YouTube Music',
    coverArt: {
      minWidth: 2048,
      maxWidth: 4096,
      minHeight: 2048,
      maxHeight: 4096,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 20 * 1024 * 1024,
      colorMode: ['RGB', 'sRGB'],
      minDPI: 72,
      bannedContent: ['violence', 'explicit imagery', 'hate symbols']
    },
    audio: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 30,
      maxDuration: 7200,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 100,
      maxArtistLength: 100,
      maxAlbumArtistLength: 100,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'releaseDate', 'coverArt'],
      bannedTerms: ['full album', 'playlist', 'compilation']
    },
    releaseTiming: {
      minLeadTime: 3,
      maxFutureDate: 365,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'America/Los_Angeles'
    },
    additionalRequirements: [
      'Content ID registration automatic',
      'Music video linking supported',
      'Art Track generation automatic'
    ]
  },
  tidal: {
    id: 'tidal',
    name: 'Tidal',
    coverArt: {
      minWidth: 3000,
      maxWidth: 4000,
      minHeight: 3000,
      maxHeight: 4000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB'],
      minDPI: 300,
      bannedContent: ['text', 'promotional', 'explicit imagery']
    },
    audio: {
      formats: ['wav', 'flac', 'mqa'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000, 88200, 96000, 192000],
      minDuration: 30,
      maxDuration: 3600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 200,
      maxArtistLength: 200,
      maxAlbumArtistLength: 200,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'genre', 'releaseDate', 'coverArt', 'isrc'],
      bannedTerms: ['karaoke', 'tribute', 'cover version']
    },
    releaseTiming: {
      minLeadTime: 14,
      maxFutureDate: 365,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'UTC'
    },
    additionalRequirements: [
      'MQA encoding supported for Masters tier',
      'Dolby Atmos supported',
      'High-resolution audio strongly preferred'
    ]
  },
  deezer: {
    id: 'deezer',
    name: 'Deezer',
    coverArt: {
      minWidth: 1400,
      maxWidth: 3000,
      minHeight: 1400,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB'],
      minDPI: 72,
      bannedContent: ['text', 'explicit imagery']
    },
    audio: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 30,
      maxDuration: 3600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 200,
      maxArtistLength: 200,
      maxAlbumArtistLength: 200,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'genre', 'releaseDate', 'coverArt'],
      bannedTerms: ['karaoke', 'tribute']
    },
    releaseTiming: {
      minLeadTime: 7,
      maxFutureDate: 365,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'Europe/Paris'
    },
    additionalRequirements: [
      'Lyrics integration with Musixmatch',
      'Flow algorithm optimization'
    ]
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    coverArt: {
      minWidth: 1400,
      maxWidth: 3000,
      minHeight: 1400,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB', 'sRGB'],
      minDPI: 72,
      bannedContent: ['text', 'logos', 'promotional content', 'explicit imagery', 'violence']
    },
    audio: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 15,
      maxDuration: 600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 100,
      maxArtistLength: 100,
      maxAlbumArtistLength: 100,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 10000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'coverArt', 'isrc'],
      bannedTerms: ['karaoke', 'tribute', 'cover version', 'remix of', 'bootleg']
    },
    releaseTiming: {
      minLeadTime: 3,
      maxFutureDate: 180,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'UTC'
    },
    additionalRequirements: [
      'Content must be suitable for all ages unless marked explicit',
      'No copyrighted samples without clearance',
      'Short clips (15-60s) optimized for viral potential',
      'ISRC required for all tracks',
      'Original content only - no AI-generated voices without disclosure',
      'Clean versions recommended for wider reach'
    ]
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram/Facebook Music',
    coverArt: {
      minWidth: 1400,
      maxWidth: 3000,
      minHeight: 1400,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB', 'sRGB'],
      minDPI: 72,
      bannedContent: ['text', 'logos', 'promotional', 'explicit imagery', 'violence', 'nudity']
    },
    audio: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 15,
      maxDuration: 600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 100,
      maxArtistLength: 100,
      maxAlbumArtistLength: 100,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 10000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'coverArt', 'isrc'],
      bannedTerms: ['karaoke', 'tribute', 'cover', 'soundalike', 'bootleg', 'unofficial']
    },
    releaseTiming: {
      minLeadTime: 3,
      maxFutureDate: 180,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'America/Los_Angeles'
    },
    additionalRequirements: [
      'Family-friendly content preferred for Reels/Stories',
      'ISRC required for content ID matching',
      'Lyrics must match audio for lip-sync features',
      'Short clips (15-90s) optimized for Stories and Reels',
      'Clean versions increase usage in user content',
      'Meta Rights Manager integration for monetization'
    ]
  },
  snapchat: {
    id: 'snapchat',
    name: 'Snapchat Sounds',
    coverArt: {
      minWidth: 1400,
      maxWidth: 3000,
      minHeight: 1400,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB'],
      minDPI: 72,
      bannedContent: ['text', 'logos', 'explicit imagery']
    },
    audio: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 15,
      maxDuration: 300,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 80,
      maxArtistLength: 80,
      maxAlbumArtistLength: 80,
      maxLabelLength: 80,
      maxGenreLength: 50,
      maxLyricsLength: 5000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'coverArt', 'isrc'],
      bannedTerms: ['karaoke', 'tribute', 'cover version']
    },
    releaseTiming: {
      minLeadTime: 3,
      maxFutureDate: 90,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'America/Los_Angeles'
    },
    additionalRequirements: [
      'Short clips optimized (15-60s most used)',
      'Clean content strongly preferred',
      'ISRC required',
      'High energy/hook-driven content performs best'
    ]
  },
  pandora: {
    id: 'pandora',
    name: 'Pandora',
    coverArt: {
      minWidth: 1400,
      maxWidth: 3000,
      minHeight: 1400,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB', 'sRGB'],
      minDPI: 72,
      bannedContent: ['text', 'promotional', 'explicit imagery']
    },
    audio: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 30,
      maxDuration: 3600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 200,
      maxArtistLength: 200,
      maxAlbumArtistLength: 200,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'genre', 'releaseDate', 'coverArt'],
      bannedTerms: ['karaoke', 'tribute', 'cover version']
    },
    releaseTiming: {
      minLeadTime: 7,
      maxFutureDate: 365,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'America/Los_Angeles'
    },
    additionalRequirements: [
      'Music Genome Project tagging benefits from complete metadata',
      'Genre and mood tags highly recommended',
      'Artist bio and photos enhance discovery'
    ]
  },
  audiomack: {
    id: 'audiomack',
    name: 'Audiomack',
    coverArt: {
      minWidth: 1400,
      maxWidth: 3000,
      minHeight: 1400,
      maxHeight: 3000,
      aspectRatio: '1:1',
      formats: ['jpg', 'jpeg', 'png'],
      maxFileSize: 10 * 1024 * 1024,
      colorMode: ['RGB'],
      minDPI: 72,
      bannedContent: ['text', 'explicit imagery without flag']
    },
    audio: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      maxBitDepth: 24,
      sampleRates: [44100, 48000],
      minDuration: 30,
      maxDuration: 3600,
      loudnessTargetLUFS: -14,
      truePeakMax: -1
    },
    metadata: {
      maxTitleLength: 200,
      maxArtistLength: 200,
      maxAlbumArtistLength: 200,
      maxLabelLength: 100,
      maxGenreLength: 50,
      maxLyricsLength: 50000,
      allowedCharacters: 'Unicode',
      requiredFields: ['title', 'artist', 'coverArt'],
      bannedTerms: ['karaoke', 'tribute']
    },
    releaseTiming: {
      minLeadTime: 2,
      maxFutureDate: 180,
      preferredReleaseDay: 5,
      blackoutDates: [],
      timezone: 'UTC'
    },
    additionalRequirements: [
      'Hip-Hop/R&B focused platform',
      'Exclusive releases get promotional boost',
      'Trending page placement for early momentum'
    ]
  }
};

export class DSPPolicyChecker {
  private policies: Map<string, DSPPolicy> = new Map();

  constructor() {
    for (const [key, policy] of Object.entries(DSP_POLICIES)) {
      this.policies.set(key.toLowerCase(), policy);
    }
  }

  getPolicy(dsp: string): DSPPolicy | undefined {
    return this.policies.get(dsp.toLowerCase());
  }

  getAllPolicies(): DSPPolicy[] {
    return Array.from(this.policies.values());
  }

  listDSPs(): string[] {
    return Array.from(this.policies.keys());
  }

  async checkCompliance(release: ReleaseToCheck, dsp: string): Promise<ComplianceResult> {
    const policy = this.getPolicy(dsp);
    if (!policy) {
      return {
        dsp,
        compliant: false,
        errors: [{
          category: 'metadata',
          field: 'dsp',
          message: `Unknown DSP: ${dsp}`,
          requirement: 'Valid DSP identifier required'
        }],
        warnings: [],
        checkedAt: new Date()
      };
    }

    const errors: ComplianceError[] = [];
    const warnings: ComplianceWarning[] = [];

    const metadataErrors = this.checkMetadataCompliance(release, policy);
    errors.push(...metadataErrors);

    const coverArtResult = await this.checkCoverArtCompliance(release, policy);
    errors.push(...coverArtResult.errors);
    warnings.push(...coverArtResult.warnings);

    const audioErrors = this.checkAudioCompliance(release, policy);
    errors.push(...audioErrors);

    const timingResult = this.checkReleaseTiming(release, policy);
    errors.push(...timingResult.errors);
    warnings.push(...timingResult.warnings);

    return {
      dsp,
      compliant: errors.length === 0,
      errors,
      warnings,
      checkedAt: new Date()
    };
  }

  private checkMetadataCompliance(release: ReleaseToCheck, policy: DSPPolicy): ComplianceError[] {
    const errors: ComplianceError[] = [];
    const meta = policy.metadata;

    if (!release.title) {
      errors.push({
        category: 'metadata',
        field: 'title',
        message: 'Title is required',
        requirement: 'Release title must be provided'
      });
    } else if (release.title.length > meta.maxTitleLength) {
      errors.push({
        category: 'metadata',
        field: 'title',
        message: `Title exceeds maximum length of ${meta.maxTitleLength} characters`,
        requirement: `Maximum ${meta.maxTitleLength} characters`,
        currentValue: release.title.length
      });
    }

    if (!release.artist) {
      errors.push({
        category: 'metadata',
        field: 'artist',
        message: 'Artist name is required',
        requirement: 'Primary artist name must be provided'
      });
    } else if (release.artist.length > meta.maxArtistLength) {
      errors.push({
        category: 'metadata',
        field: 'artist',
        message: `Artist name exceeds maximum length of ${meta.maxArtistLength} characters`,
        requirement: `Maximum ${meta.maxArtistLength} characters`,
        currentValue: release.artist.length
      });
    }

    if (release.label && release.label.length > meta.maxLabelLength) {
      errors.push({
        category: 'metadata',
        field: 'label',
        message: `Label name exceeds maximum length of ${meta.maxLabelLength} characters`,
        requirement: `Maximum ${meta.maxLabelLength} characters`,
        currentValue: release.label.length
      });
    }

    const titleLower = (release.title || '').toLowerCase();
    for (const term of meta.bannedTerms) {
      if (titleLower.includes(term.toLowerCase())) {
        errors.push({
          category: 'metadata',
          field: 'title',
          message: `Title contains banned term: "${term}"`,
          requirement: `Titles cannot contain: ${meta.bannedTerms.join(', ')}`
        });
      }
    }

    if (release.tracks) {
      for (let i = 0; i < release.tracks.length; i++) {
        const track = release.tracks[i];
        if (track.title && track.title.length > meta.maxTitleLength) {
          errors.push({
            category: 'metadata',
            field: `tracks[${i}].title`,
            message: `Track title exceeds maximum length`,
            requirement: `Maximum ${meta.maxTitleLength} characters`,
            currentValue: track.title.length
          });
        }

        if (track.lyrics && track.lyrics.length > meta.maxLyricsLength) {
          errors.push({
            category: 'metadata',
            field: `tracks[${i}].lyrics`,
            message: `Lyrics exceed maximum length`,
            requirement: `Maximum ${meta.maxLyricsLength} characters`,
            currentValue: track.lyrics.length
          });
        }
      }
    }

    return errors;
  }

  private async checkCoverArtCompliance(
    release: ReleaseToCheck, 
    policy: DSPPolicy
  ): Promise<{ errors: ComplianceError[]; warnings: ComplianceWarning[] }> {
    const errors: ComplianceError[] = [];
    const warnings: ComplianceWarning[] = [];
    const art = policy.coverArt;

    if (!release.coverArtPath && !release.coverArtUrl && !release.coverArtMetadata) {
      errors.push({
        category: 'coverArt',
        field: 'coverArt',
        message: 'Cover art is required',
        requirement: 'All releases must include cover artwork'
      });
      return { errors, warnings };
    }

    let metadata = release.coverArtMetadata;

    if (release.coverArtPath && fs.existsSync(release.coverArtPath)) {
      try {
        const sharpInstance = await getSharp();
        if (!sharpInstance) {
          logger.warn('Sharp not available - skipping cover art validation for file path');
        } else {
          const imageInfo = await sharpInstance(release.coverArtPath).metadata();
          const stats = fs.statSync(release.coverArtPath);
          
          metadata = {
            width: imageInfo.width,
            height: imageInfo.height,
            format: imageInfo.format,
            fileSize: stats.size
          };
        }
      } catch (error) {
        logger.error('Error reading cover art metadata:', error);
      }
    }

    if (metadata) {
      if (metadata.width && metadata.width < art.minWidth) {
        errors.push({
          category: 'coverArt',
          field: 'coverArt.width',
          message: `Cover art width (${metadata.width}px) is below minimum (${art.minWidth}px)`,
          requirement: `Minimum width: ${art.minWidth}px`,
          currentValue: metadata.width
        });
      }

      if (metadata.height && metadata.height < art.minHeight) {
        errors.push({
          category: 'coverArt',
          field: 'coverArt.height',
          message: `Cover art height (${metadata.height}px) is below minimum (${art.minHeight}px)`,
          requirement: `Minimum height: ${art.minHeight}px`,
          currentValue: metadata.height
        });
      }

      if (metadata.width && metadata.height && metadata.width !== metadata.height) {
        errors.push({
          category: 'coverArt',
          field: 'coverArt.aspectRatio',
          message: `Cover art must be square (1:1 aspect ratio). Current: ${metadata.width}x${metadata.height}`,
          requirement: 'Aspect ratio must be 1:1',
          currentValue: `${metadata.width}x${metadata.height}`
        });
      }

      if (metadata.format) {
        const format = metadata.format.toLowerCase();
        if (!art.formats.includes(format)) {
          errors.push({
            category: 'coverArt',
            field: 'coverArt.format',
            message: `Cover art format "${format}" is not accepted`,
            requirement: `Accepted formats: ${art.formats.join(', ')}`,
            currentValue: format
          });
        }
      }

      if (metadata.fileSize && metadata.fileSize > art.maxFileSize) {
        errors.push({
          category: 'coverArt',
          field: 'coverArt.fileSize',
          message: `Cover art file size (${Math.round(metadata.fileSize / 1024 / 1024)}MB) exceeds maximum`,
          requirement: `Maximum file size: ${Math.round(art.maxFileSize / 1024 / 1024)}MB`,
          currentValue: metadata.fileSize
        });
      }

      if (metadata.width && metadata.width < 3000) {
        warnings.push({
          category: 'coverArt',
          field: 'coverArt.width',
          message: 'Cover art resolution could be higher for best quality',
          suggestion: 'Use 3000x3000 pixels for optimal quality across all platforms'
        });
      }
    }

    return { errors, warnings };
  }

  private checkAudioCompliance(release: ReleaseToCheck, policy: DSPPolicy): ComplianceError[] {
    const errors: ComplianceError[] = [];
    const audio = policy.audio;

    if (!release.audioFiles || release.audioFiles.length === 0) {
      return errors;
    }

    for (let i = 0; i < release.audioFiles.length; i++) {
      const file = release.audioFiles[i];
      
      if (file.format) {
        const format = file.format.toLowerCase();
        if (!audio.formats.includes(format)) {
          errors.push({
            category: 'audio',
            field: `audioFiles[${i}].format`,
            message: `Audio format "${format}" is not accepted`,
            requirement: `Accepted formats: ${audio.formats.join(', ')}`,
            currentValue: format
          });
        }
      }

      if (file.bitDepth) {
        if (file.bitDepth < audio.minBitDepth) {
          errors.push({
            category: 'audio',
            field: `audioFiles[${i}].bitDepth`,
            message: `Bit depth (${file.bitDepth}) is below minimum (${audio.minBitDepth})`,
            requirement: `Minimum bit depth: ${audio.minBitDepth}`,
            currentValue: file.bitDepth
          });
        }
        if (file.bitDepth > audio.maxBitDepth) {
          errors.push({
            category: 'audio',
            field: `audioFiles[${i}].bitDepth`,
            message: `Bit depth (${file.bitDepth}) exceeds maximum (${audio.maxBitDepth})`,
            requirement: `Maximum bit depth: ${audio.maxBitDepth}`,
            currentValue: file.bitDepth
          });
        }
      }

      if (file.sampleRate && !audio.sampleRates.includes(file.sampleRate)) {
        errors.push({
          category: 'audio',
          field: `audioFiles[${i}].sampleRate`,
          message: `Sample rate ${file.sampleRate}Hz is not accepted`,
          requirement: `Accepted sample rates: ${audio.sampleRates.join(', ')}Hz`,
          currentValue: file.sampleRate
        });
      }

      if (file.duration) {
        if (file.duration < audio.minDuration) {
          errors.push({
            category: 'audio',
            field: `audioFiles[${i}].duration`,
            message: `Track duration (${file.duration}s) is below minimum (${audio.minDuration}s)`,
            requirement: `Minimum duration: ${audio.minDuration} seconds`,
            currentValue: file.duration
          });
        }
        if (file.duration > audio.maxDuration) {
          errors.push({
            category: 'audio',
            field: `audioFiles[${i}].duration`,
            message: `Track duration (${file.duration}s) exceeds maximum (${audio.maxDuration}s)`,
            requirement: `Maximum duration: ${audio.maxDuration} seconds`,
            currentValue: file.duration
          });
        }
      }

      if (file.truePeak !== undefined && file.truePeak > audio.truePeakMax) {
        errors.push({
          category: 'audio',
          field: `audioFiles[${i}].truePeak`,
          message: `True peak (${file.truePeak}dB) exceeds maximum (${audio.truePeakMax}dB)`,
          requirement: `Maximum true peak: ${audio.truePeakMax}dB`,
          currentValue: file.truePeak
        });
      }
    }

    return errors;
  }

  private checkReleaseTiming(
    release: ReleaseToCheck, 
    policy: DSPPolicy
  ): { errors: ComplianceError[]; warnings: ComplianceWarning[] } {
    const errors: ComplianceError[] = [];
    const warnings: ComplianceWarning[] = [];
    const timing = policy.releaseTiming;

    if (!release.releaseDate) {
      errors.push({
        category: 'timing',
        field: 'releaseDate',
        message: 'Release date is required',
        requirement: 'A release date must be specified'
      });
      return { errors, warnings };
    }

    const releaseDate = new Date(release.releaseDate);
    const now = new Date();
    const daysUntilRelease = Math.floor((releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilRelease < 0) {
      errors.push({
        category: 'timing',
        field: 'releaseDate',
        message: 'Release date is in the past',
        requirement: 'Release date must be in the future',
        currentValue: releaseDate.toISOString()
      });
    } else if (daysUntilRelease < timing.minLeadTime) {
      errors.push({
        category: 'timing',
        field: 'releaseDate',
        message: `Release date is only ${daysUntilRelease} days away`,
        requirement: `Minimum lead time: ${timing.minLeadTime} days`,
        currentValue: daysUntilRelease
      });
    }

    if (daysUntilRelease > timing.maxFutureDate) {
      errors.push({
        category: 'timing',
        field: 'releaseDate',
        message: `Release date is ${daysUntilRelease} days in the future`,
        requirement: `Maximum future date: ${timing.maxFutureDate} days`,
        currentValue: daysUntilRelease
      });
    }

    const dayOfWeek = releaseDate.getDay();
    if (dayOfWeek !== timing.preferredReleaseDay) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      warnings.push({
        category: 'timing',
        field: 'releaseDate',
        message: `Release date falls on ${days[dayOfWeek]}`,
        suggestion: `${days[timing.preferredReleaseDay]} releases are preferred for better chart performance`
      });
    }

    return { errors, warnings };
  }

  async checkAllDSPs(release: ReleaseToCheck): Promise<{ [dsp: string]: ComplianceResult }> {
    const results: { [dsp: string]: ComplianceResult } = {};
    
    for (const dsp of this.listDSPs()) {
      results[dsp] = await this.checkCompliance(release, dsp);
    }
    
    return results;
  }

  getRequirementsSummary(dsp: string): {
    coverArt: string[];
    audio: string[];
    metadata: string[];
    timing: string[];
    additional: string[];
  } | null {
    const policy = this.getPolicy(dsp);
    if (!policy) return null;

    return {
      coverArt: [
        `Dimensions: ${policy.coverArt.minWidth}x${policy.coverArt.minHeight} to ${policy.coverArt.maxWidth}x${policy.coverArt.maxHeight} pixels`,
        `Aspect ratio: ${policy.coverArt.aspectRatio}`,
        `Formats: ${policy.coverArt.formats.join(', ')}`,
        `Max file size: ${Math.round(policy.coverArt.maxFileSize / 1024 / 1024)}MB`,
        `Color mode: ${policy.coverArt.colorMode.join(', ')}`
      ],
      audio: [
        `Formats: ${policy.audio.formats.join(', ')}`,
        `Bit depth: ${policy.audio.minBitDepth}-${policy.audio.maxBitDepth} bit`,
        `Sample rates: ${policy.audio.sampleRates.join(', ')}Hz`,
        `Duration: ${policy.audio.minDuration}s - ${policy.audio.maxDuration}s`,
        `Loudness target: ${policy.audio.loudnessTargetLUFS} LUFS`,
        `True peak max: ${policy.audio.truePeakMax}dB`
      ],
      metadata: [
        `Title: max ${policy.metadata.maxTitleLength} characters`,
        `Artist: max ${policy.metadata.maxArtistLength} characters`,
        `Label: max ${policy.metadata.maxLabelLength} characters`,
        `Required fields: ${policy.metadata.requiredFields.join(', ')}`,
        `Banned terms: ${policy.metadata.bannedTerms.join(', ')}`
      ],
      timing: [
        `Minimum lead time: ${policy.releaseTiming.minLeadTime} days`,
        `Maximum future date: ${policy.releaseTiming.maxFutureDate} days`,
        `Preferred release day: ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][policy.releaseTiming.preferredReleaseDay]}`
      ],
      additional: policy.additionalRequirements
    };
  }
}

export const dspPolicyChecker = new DSPPolicyChecker();
