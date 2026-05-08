import { getCsrfTokenFromCookie } from '../queryClient';
export type AudioFormat = 'wav' | 'flac' | 'aiff' | 'mp3' | 'aac' | 'ogg' | 'opus';
export type BitDepth = 16 | 24 | 32;
export type SampleRate = 44100 | 48000 | 88200 | 96000 | 176400 | 192000;
export type DitherType = 'none' | 'rectangular' | 'triangular' | 'noise-shaped-light' | 'noise-shaped-medium' | 'noise-shaped-heavy' | 'pow-r1' | 'pow-r2' | 'pow-r3';
export type NormalizationType = 'off' | 'peak' | 'rms' | 'lufs' | 'true-peak';
export type LimiterType = 'off' | 'brickwall' | 'true-peak' | 'isp' | 'soft-clip';

export interface RenderMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  comment?: string;
  trackNumber?: string;
  isrc?: string;
  iswc?: string;
  upc?: string;
  copyright?: string;
  encodedBy?: string;
  bpm?: number;
  key?: string;
  label?: string;
  producer?: string;
  mixer?: string;
  masteringEngineer?: string;
}

export interface RenderSettings {
  format: AudioFormat;
  sampleRate: SampleRate;
  bitDepth: BitDepth;
  channels: 1 | 2;
  
  dither: DitherType;
  ditherBitDepth?: BitDepth;
  noiseShapingFrequency?: number;
  
  normalize: NormalizationType;
  normalizeTarget: number;
  truePeakCeiling: number;
  
  limiter: LimiterType;
  limiterThreshold: number;
  limiterRelease: number;
  limiterLookahead: number;
  
  dcOffset: boolean;
  fadeIn: number;
  fadeOut: number;
  fadeType: 'linear' | 'exponential' | 'logarithmic' | 's-curve' | 'equal-power';
  
  tailLength: number;
  trimSilence: boolean;
  silenceThreshold: number;
  
  mp3Bitrate?: 128 | 192 | 256 | 320;
  mp3Vbr?: boolean;
  mp3VbrQuality?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  
  aacBitrate?: 128 | 192 | 256 | 320;
  aacProfile?: 'aac-lc' | 'aac-he' | 'aac-hev2';
  
  oggQuality?: number;
  opusBitrate?: number;
  
  flacCompression?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  
  metadata: RenderMetadata;
  
  exportRange: 'full' | 'loop' | 'selection' | 'markers';
  rangeStart?: number;
  rangeEnd?: number;
  markerIds?: string[];
  
  realtime: boolean;
  offlineMultiplier: number;
  
  stemExport: boolean;
  stemTracks?: string[];
  stemGrouping: 'individual' | 'bus' | 'type';
  
  multiFormat: boolean;
  additionalFormats?: RenderSettings[];
}

export interface RenderProgress {
  phase: 'preparing' | 'processing' | 'mixing' | 'mastering' | 'encoding' | 'finalizing' | 'complete' | 'error';
  progress: number;
  currentTrack?: string;
  estimatedTimeRemaining?: number;
  peakLevel?: number;
  lufs?: number;
  truePeak?: number;
  warnings?: string[];
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  downloadUrl?: string;
  duration: number;
  fileSize: number;
  peakLevel: number;
  lufs: number;
  truePeak: number;
  warnings: string[];
  stems?: Array<{
    trackId: string;
    trackName: string;
    outputPath: string;
    downloadUrl: string;
  }>;
}

export const RENDER_PRESETS: Record<string, Partial<RenderSettings>> = {
  'master-cd': {
    format: 'wav',
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    dither: 'pow-r2',
    normalize: 'lufs',
    normalizeTarget: -14,
    truePeakCeiling: -1,
    limiter: 'true-peak',
    limiterThreshold: -1,
  },
  'master-streaming': {
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    dither: 'none',
    normalize: 'lufs',
    normalizeTarget: -14,
    truePeakCeiling: -1,
    limiter: 'true-peak',
    limiterThreshold: -1,
  },
  'master-vinyl': {
    format: 'wav',
    sampleRate: 96000,
    bitDepth: 24,
    channels: 2,
    dither: 'none',
    normalize: 'lufs',
    normalizeTarget: -18,
    truePeakCeiling: -3,
    limiter: 'soft-clip',
    limiterThreshold: -3,
  },
  'master-hires': {
    format: 'flac',
    sampleRate: 96000,
    bitDepth: 24,
    channels: 2,
    dither: 'none',
    normalize: 'off',
    normalizeTarget: 0,
    truePeakCeiling: -0.3,
    limiter: 'true-peak',
    limiterThreshold: -0.3,
  },
  'master-archive': {
    format: 'wav',
    sampleRate: 96000,
    bitDepth: 32,
    channels: 2,
    dither: 'none',
    normalize: 'off',
    normalizeTarget: 0,
    truePeakCeiling: 0,
    limiter: 'off',
    limiterThreshold: 0,
  },
  'mp3-320': {
    format: 'mp3',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    mp3Bitrate: 320,
    mp3Vbr: false,
    normalize: 'lufs',
    normalizeTarget: -14,
    truePeakCeiling: -1,
  },
  'mp3-vbr': {
    format: 'mp3',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    mp3Vbr: true,
    mp3VbrQuality: 0,
    normalize: 'lufs',
    normalizeTarget: -14,
    truePeakCeiling: -1,
  },
  'podcast': {
    format: 'mp3',
    sampleRate: 44100,
    bitDepth: 16,
    channels: 1,
    mp3Bitrate: 128,
    normalize: 'lufs',
    normalizeTarget: -16,
    truePeakCeiling: -1,
  },
  'broadcast-ebur128': {
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    normalize: 'lufs',
    normalizeTarget: -23,
    truePeakCeiling: -1,
    limiter: 'true-peak',
    limiterThreshold: -1,
  },
  'film-dialog': {
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    normalize: 'lufs',
    normalizeTarget: -27,
    truePeakCeiling: -3,
    limiter: 'off',
    limiterThreshold: 0,
  },
  'apple-digital-masters': {
    format: 'flac',
    sampleRate: 96000,
    bitDepth: 24,
    channels: 2,
    dither: 'none',
    normalize: 'lufs',
    normalizeTarget: -16,
    truePeakCeiling: -1,
    limiter: 'true-peak',
    limiterThreshold: -1,
  },
  'spotify-loud': {
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    normalize: 'lufs',
    normalizeTarget: -14,
    truePeakCeiling: -1,
    limiter: 'true-peak',
    limiterThreshold: -1,
  },
  'youtube': {
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    normalize: 'lufs',
    normalizeTarget: -14,
    truePeakCeiling: -1,
    limiter: 'true-peak',
    limiterThreshold: -1,
  },
  'stems-mixing': {
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 32,
    channels: 2,
    dither: 'none',
    normalize: 'off',
    normalizeTarget: 0,
    limiter: 'off',
    limiterThreshold: 0,
    stemExport: true,
    stemGrouping: 'individual',
  },
};

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  format: 'wav',
  sampleRate: 48000,
  bitDepth: 24,
  channels: 2,
  
  dither: 'triangular',
  ditherBitDepth: 24,
  
  normalize: 'lufs',
  normalizeTarget: -14,
  truePeakCeiling: -1,
  
  limiter: 'true-peak',
  limiterThreshold: -1,
  limiterRelease: 100,
  limiterLookahead: 5,
  
  dcOffset: true,
  fadeIn: 0,
  fadeOut: 0,
  fadeType: 'equal-power',
  
  tailLength: 0,
  trimSilence: false,
  silenceThreshold: -60,
  
  mp3Bitrate: 320,
  mp3Vbr: false,
  mp3VbrQuality: 2,
  
  aacBitrate: 256,
  aacProfile: 'aac-lc',
  
  oggQuality: 8,
  opusBitrate: 128,
  
  flacCompression: 5,
  
  metadata: {},
  
  exportRange: 'full',
  
  realtime: false,
  offlineMultiplier: 10,
  
  stemExport: false,
  stemGrouping: 'individual',
  
  multiFormat: false,
};

export class AudioRenderEngine {
  private listeners: Set<(progress: RenderProgress) => void> = new Set();
  private abortController: AbortController | null = null;
  private isRendering = false;

  getPresets(): typeof RENDER_PRESETS {
    return RENDER_PRESETS;
  }

  getDefaultSettings(): RenderSettings {
    return { ...DEFAULT_RENDER_SETTINGS };
  }

  applyPreset(presetName: string, baseSettings: RenderSettings = DEFAULT_RENDER_SETTINGS): RenderSettings {
    const preset = RENDER_PRESETS[presetName];
    if (!preset) return baseSettings;
    return { ...baseSettings, ...preset };
  }

  calculateEstimatedSize(settings: RenderSettings, durationSeconds: number): number {
    const channels = settings.channels;
    const bytesPerSample = settings.bitDepth / 8;
    
    switch (settings.format) {
      case 'wav':
      case 'aiff':
        return durationSeconds * settings.sampleRate * channels * bytesPerSample;
      case 'flac':
        const compressionRatio = 1 - (settings.flacCompression || 5) * 0.05;
        return durationSeconds * settings.sampleRate * channels * bytesPerSample * compressionRatio;
      case 'mp3':
        return durationSeconds * ((settings.mp3Bitrate || 320) * 1000 / 8);
      case 'aac':
        return durationSeconds * ((settings.aacBitrate || 256) * 1000 / 8);
      case 'ogg':
        const oggBitrate = 64 + (settings.oggQuality || 5) * 32;
        return durationSeconds * (oggBitrate * 1000 / 8);
      case 'opus':
        return durationSeconds * ((settings.opusBitrate || 128) * 1000 / 8);
      default:
        return durationSeconds * settings.sampleRate * channels * bytesPerSample;
    }
  }

  calculateEstimatedTime(settings: RenderSettings, durationSeconds: number): number {
    if (settings.realtime) {
      return durationSeconds;
    }
    return durationSeconds / settings.offlineMultiplier;
  }

  validateSettings(settings: RenderSettings): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (settings.format === 'mp3' && settings.bitDepth === 32) {
      warnings.push('32-bit depth will be converted to 24-bit for MP3 encoding');
    }

    if (settings.dither !== 'none' && settings.bitDepth === 32) {
      warnings.push('Dithering is not typically needed for 32-bit float exports');
    }

    if (settings.format === 'wav' && settings.bitDepth === 16 && settings.dither === 'none') {
      warnings.push('Consider enabling dithering when exporting to 16-bit to reduce quantization noise');
    }

    if (settings.normalize === 'lufs' && settings.normalizeTarget > -9) {
      warnings.push('LUFS target above -9 may result in audible distortion');
    }

    if (settings.limiter === 'off' && settings.normalize !== 'off') {
      warnings.push('Normalization without limiting may cause clipping');
    }

    if (settings.truePeakCeiling > -0.1 && settings.format !== 'wav') {
      warnings.push('True peak ceiling above -0.1 dB may cause intersample peaks in lossy formats');
    }

    if (settings.sampleRate > 48000 && (settings.format === 'mp3' || settings.format === 'ogg')) {
      warnings.push(`${settings.format.toUpperCase()} will be resampled to 48kHz`);
    }

    if (settings.metadata.isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(settings.metadata.isrc)) {
      errors.push('Invalid ISRC format. Expected: CCXXXYYNNNNN (e.g., USRC17607839)');
    }

    if (settings.metadata.upc && !/^\d{12,14}$/.test(settings.metadata.upc)) {
      errors.push('Invalid UPC format. Expected: 12-14 digits');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async render(
    projectId: string,
    settings: RenderSettings,
    onProgress?: (progress: RenderProgress) => void
  ): Promise<RenderResult> {
    if (this.isRendering) {
      throw new Error('Render already in progress');
    }

    this.isRendering = true;
    this.abortController = new AbortController();

    const notify = (progress: RenderProgress) => {
      if (onProgress) onProgress(progress);
      this.listeners.forEach(l => l(progress));
    };

    try {
      const validation = this.validateSettings(settings);
      if (!validation.valid) {
        throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
      }

      notify({
        phase: 'preparing',
        progress: 0,
        warnings: validation.warnings,
      });

      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(`/api/studio/projects/${projectId}/render`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify(settings),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Render failed');
      }

      const result: RenderResult = await response.json();

      notify({
        phase: 'complete',
        progress: 100,
        peakLevel: result.peakLevel,
        lufs: result.lufs,
        truePeak: result.truePeak,
        warnings: result.warnings,
      });

      return result;

    } catch (error) {
      notify({
        phase: 'error',
        progress: 0,
        warnings: [(error as Error).message],
      });
      throw error;
    } finally {
      this.isRendering = false;
      this.abortController = null;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  subscribe(listener: (progress: RenderProgress) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getIsRendering(): boolean {
    return this.isRendering;
  }
}

export const audioRenderEngine = new AudioRenderEngine();
