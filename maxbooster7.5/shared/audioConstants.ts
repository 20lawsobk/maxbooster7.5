/**
 * Professional Audio Quality Constants
 * Pro Tools parity standards for Max Booster DAW/Studio
 */

export const AUDIO_FORMATS = {
  PCM16: 'pcm16',
  PCM24: 'pcm24',
  FLOAT32: 'float32',
} as const;

export type AudioFormat = (typeof AUDIO_FORMATS)[keyof typeof AUDIO_FORMATS];

export const SAMPLE_RATES = {
  SR_44100: 44100,
  SR_48000: 48000,
  SR_96000: 96000,
  SR_192000: 192000,
} as const;

export type SampleRate = (typeof SAMPLE_RATES)[keyof typeof SAMPLE_RATES];

export const BIT_DEPTHS = {
  BD_16: 16,
  BD_24: 24,
  BD_32: 32,
} as const;

export type BitDepth = (typeof BIT_DEPTHS)[keyof typeof BIT_DEPTHS];

export const BUFFER_SIZES = {
  ULTRA_LOW_LATENCY: 64,
  LOW_LATENCY: 128,
  BALANCED: 256,
  HIGH_QUALITY: 512,
  ULTRA_HIGH_QUALITY: 1024,
} as const;

export type BufferSize = (typeof BUFFER_SIZES)[keyof typeof BUFFER_SIZES];

export const AUDIO_QUALITY_PRESETS = {
  PODCAST: {
    format: AUDIO_FORMATS.PCM16,
    sampleRate: SAMPLE_RATES.SR_44100,
    bitDepth: BIT_DEPTHS.BD_16,
    bufferSize: BUFFER_SIZES.BALANCED,
  },
  MUSIC_STANDARD: {
    format: AUDIO_FORMATS.PCM24,
    sampleRate: SAMPLE_RATES.SR_48000,
    bitDepth: BIT_DEPTHS.BD_24,
    bufferSize: BUFFER_SIZES.BALANCED,
  },
  MUSIC_HI_RES: {
    format: AUDIO_FORMATS.PCM24,
    sampleRate: SAMPLE_RATES.SR_96000,
    bitDepth: BIT_DEPTHS.BD_24,
    bufferSize: BUFFER_SIZES.HIGH_QUALITY,
  },
  MASTERING: {
    format: AUDIO_FORMATS.FLOAT32,
    sampleRate: SAMPLE_RATES.SR_96000,
    bitDepth: BIT_DEPTHS.BD_32,
    bufferSize: BUFFER_SIZES.ULTRA_HIGH_QUALITY,
  },
  STUDIO_REFERENCE: {
    format: AUDIO_FORMATS.FLOAT32,
    sampleRate: SAMPLE_RATES.SR_192000,
    bitDepth: BIT_DEPTHS.BD_32,
    bufferSize: BUFFER_SIZES.ULTRA_HIGH_QUALITY,
  },
} as const;

export const TRACK_LIMITS = {
  MINIMUM: 1,
  STANDARD: 64,
  PROFESSIONAL: 256,
  MAXIMUM: 512,
} as const;

export const PERFORMANCE_GUARANTEES = {
  TRACK_COUNT_256: {
    maxTracks: 256,
    description: 'Guaranteed smooth playback for 256+ tracks',
    requirements: {
      sampleRate: SAMPLE_RATES.SR_48000,
      bufferSize: BUFFER_SIZES.BALANCED,
      effectsPerTrack: 8,
    },
  },
  TRACK_COUNT_128: {
    maxTracks: 128,
    description: 'Guaranteed smooth playback for 128+ tracks at high sample rates',
    requirements: {
      sampleRate: SAMPLE_RATES.SR_96000,
      bufferSize: BUFFER_SIZES.HIGH_QUALITY,
      effectsPerTrack: 8,
    },
  },
  TRACK_COUNT_64: {
    maxTracks: 64,
    description: 'Guaranteed smooth playback for 64+ tracks at ultra-high sample rates',
    requirements: {
      sampleRate: SAMPLE_RATES.SR_192000,
      bufferSize: BUFFER_SIZES.ULTRA_HIGH_QUALITY,
      effectsPerTrack: 8,
    },
  },
} as const;

export const LATENCY_TARGETS = {
  RECORDING: {
    targetMs: 5,
    bufferSize: BUFFER_SIZES.ULTRA_LOW_LATENCY,
    description: 'Ultra-low latency for live recording',
  },
  MIXING: {
    targetMs: 10,
    bufferSize: BUFFER_SIZES.LOW_LATENCY,
    description: 'Low latency for mixing and editing',
  },
  MASTERING: {
    targetMs: 20,
    bufferSize: BUFFER_SIZES.HIGH_QUALITY,
    description: 'Higher quality for mastering',
  },
} as const;

export const SUPPORTED_SAMPLE_RATES = [
  SAMPLE_RATES.SR_44100,
  SAMPLE_RATES.SR_48000,
  SAMPLE_RATES.SR_96000,
  SAMPLE_RATES.SR_192000,
] as const;

export const SUPPORTED_BIT_DEPTHS = [BIT_DEPTHS.BD_16, BIT_DEPTHS.BD_24, BIT_DEPTHS.BD_32] as const;

export const SUPPORTED_FORMATS = [
  AUDIO_FORMATS.PCM16,
  AUDIO_FORMATS.PCM24,
  AUDIO_FORMATS.FLOAT32,
] as const;

export const AUDIO_FORMAT_SPECS = {
  [AUDIO_FORMATS.PCM16]: {
    name: '16-bit PCM',
    bitDepth: BIT_DEPTHS.BD_16,
    dynamicRange: 96,
    description: 'Standard quality - ideal for podcasts and demos',
    fileSize: 'Small',
  },
  [AUDIO_FORMATS.PCM24]: {
    name: '24-bit PCM',
    bitDepth: BIT_DEPTHS.BD_24,
    dynamicRange: 144,
    description: 'Professional quality - ideal for music production',
    fileSize: 'Medium',
  },
  [AUDIO_FORMATS.FLOAT32]: {
    name: '32-bit Float',
    bitDepth: BIT_DEPTHS.BD_32,
    dynamicRange: 1680,
    description: 'Studio reference quality - ideal for mastering and archival',
    fileSize: 'Large',
  },
} as const;

export const FFMPEG_CODECS = {
  [AUDIO_FORMATS.PCM16]: 'pcm_s16le',
  [AUDIO_FORMATS.PCM24]: 'pcm_s24le',
  [AUDIO_FORMATS.FLOAT32]: 'pcm_f32le',
} as const;

export function isSupportedSampleRate(rate: number): rate is SampleRate {
  return SUPPORTED_SAMPLE_RATES.includes(rate as SampleRate);
}

export function isSupportedBitDepth(depth: number): depth is BitDepth {
  return SUPPORTED_BIT_DEPTHS.includes(depth as BitDepth);
}

export function isSupportedFormat(format: string): format is AudioFormat {
  return SUPPORTED_FORMATS.includes(format as AudioFormat);
}

export function getRecommendedBufferSize(
  sampleRate: SampleRate,
  latencyTarget: 'recording' | 'mixing' | 'mastering'
): BufferSize {
  const target = LATENCY_TARGETS[latencyTarget];

  if (sampleRate >= SAMPLE_RATES.SR_96000) {
    return target.bufferSize === BUFFER_SIZES.ULTRA_LOW_LATENCY
      ? BUFFER_SIZES.LOW_LATENCY
      : target.bufferSize === BUFFER_SIZES.LOW_LATENCY
        ? BUFFER_SIZES.BALANCED
        : BUFFER_SIZES.HIGH_QUALITY;
  }

  return target.bufferSize;
}

export function calculateLatencyMs(bufferSize: BufferSize, sampleRate: SampleRate): number {
  return (bufferSize / sampleRate) * 1000;
}

export function getMaxTracksForConfig(sampleRate: SampleRate, bufferSize: BufferSize): number {
  if (sampleRate >= SAMPLE_RATES.SR_192000) {
    return TRACK_LIMITS.STANDARD;
  } else if (sampleRate >= SAMPLE_RATES.SR_96000) {
    return bufferSize >= BUFFER_SIZES.HIGH_QUALITY
      ? TRACK_LIMITS.PROFESSIONAL
      : TRACK_LIMITS.STANDARD;
  } else {
    return TRACK_LIMITS.PROFESSIONAL;
  }
}

export function validateAudioConfig(config: {
  format?: string;
  sampleRate?: number;
  bitDepth?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.format && !isSupportedFormat(config.format)) {
    errors.push(
      `Unsupported audio format: ${config.format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`
    );
  }

  if (config.sampleRate && !isSupportedSampleRate(config.sampleRate)) {
    errors.push(
      `Unsupported sample rate: ${config.sampleRate}Hz. Supported: ${SUPPORTED_SAMPLE_RATES.join(', ')}Hz`
    );
  }

  if (config.bitDepth && !isSupportedBitDepth(config.bitDepth)) {
    errors.push(
      `Unsupported bit depth: ${config.bitDepth}-bit. Supported: ${SUPPORTED_BIT_DEPTHS.join(', ')}-bit`
    );
  }

  if (
    config.format === AUDIO_FORMATS.FLOAT32 &&
    config.bitDepth &&
    config.bitDepth !== BIT_DEPTHS.BD_32
  ) {
    errors.push('Float32 format requires 32-bit depth');
  }

  if (
    config.format === AUDIO_FORMATS.PCM16 &&
    config.bitDepth &&
    config.bitDepth !== BIT_DEPTHS.BD_16
  ) {
    errors.push('PCM16 format requires 16-bit depth');
  }

  if (
    config.format === AUDIO_FORMATS.PCM24 &&
    config.bitDepth &&
    config.bitDepth !== BIT_DEPTHS.BD_24
  ) {
    errors.push('PCM24 format requires 24-bit depth');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
