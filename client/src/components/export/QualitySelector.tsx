import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HardDrive,
  Clock,
  Zap,
  Volume2,
  AudioWaveform,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AudioQualitySettings {
  sampleRate: number;
  bitDepth: number;
  bitrate: number;
  channels: 'mono' | 'stereo';
}

export interface AudioProcessingSettings {
  normalize: boolean;
  normalizeTarget: number;
  dither: boolean;
  ditherType: 'none' | 'triangular' | 'noise-shaped';
  limiter: boolean;
  limiterCeiling: number;
}

export interface MasteringPreset {
  id: string;
  name: string;
  description: string;
  settings: Partial<AudioQualitySettings & AudioProcessingSettings>;
}

interface QualitySelectorProps {
  quality: AudioQualitySettings;
  onQualityChange: (quality: AudioQualitySettings) => void;
  processing?: AudioProcessingSettings;
  onProcessingChange?: (processing: AudioProcessingSettings) => void;
  isLossless: boolean;
  className?: string;
  showAdvanced?: boolean;
}

const SAMPLE_RATES = [
  { value: 44100, label: '44.1 kHz', description: 'CD Quality', recommended: true },
  { value: 48000, label: '48 kHz', description: 'Video Standard' },
  { value: 88200, label: '88.2 kHz', description: 'High Resolution' },
  { value: 96000, label: '96 kHz', description: 'Professional' },
  { value: 176400, label: '176.4 kHz', description: 'Mastering' },
  { value: 192000, label: '192 kHz', description: 'Ultra HD' },
];

const BIT_DEPTHS = [
  { value: 16, label: '16-bit', description: 'Standard (CD)', fileSize: '1x' },
  { value: 24, label: '24-bit', description: 'Professional', fileSize: '1.5x', recommended: true },
  { value: 32, label: '32-bit Float', description: 'Maximum Quality', fileSize: '2x' },
];

const BITRATES = [
  { value: 128, label: '128 kbps', quality: 'Basic', description: 'Streaming' },
  { value: 192, label: '192 kbps', quality: 'Good', description: 'General Use' },
  { value: 256, label: '256 kbps', quality: 'High', description: 'High Quality' },
  { value: 320, label: '320 kbps', quality: 'Maximum', description: 'Best MP3', recommended: true },
];

export const MASTERING_PRESETS: MasteringPreset[] = [
  {
    id: 'streaming',
    name: 'Streaming Optimized',
    description: 'Loudness normalized for Spotify, Apple Music',
    settings: { normalize: true, normalizeTarget: -14, limiter: true, limiterCeiling: -1 },
  },
  {
    id: 'cd',
    name: 'CD Master',
    description: 'Traditional CD loudness standards',
    settings: { sampleRate: 44100, bitDepth: 16, normalize: true, normalizeTarget: -0.3, dither: true, ditherType: 'noise-shaped' },
  },
  {
    id: 'vinyl',
    name: 'Vinyl Premaster',
    description: 'Optimized for vinyl cutting',
    settings: { normalize: true, normalizeTarget: -3, limiter: true, limiterCeiling: -0.5 },
  },
  {
    id: 'broadcast',
    name: 'Broadcast Ready',
    description: 'EBU R128 broadcast standards',
    settings: { normalize: true, normalizeTarget: -23, limiter: true, limiterCeiling: -1 },
  },
  {
    id: 'archival',
    name: 'Archival Master',
    description: 'Maximum quality for archiving',
    settings: { sampleRate: 96000, bitDepth: 32, normalize: false, dither: false },
  },
];

export const QualitySelector = memo(function QualitySelector({
  quality,
  onQualityChange,
  processing,
  onProcessingChange,
  isLossless,
  className,
  showAdvanced = false,
}: QualitySelectorProps) {
  const estimatedFileSize = useMemo(() => {
    const durationSeconds = 180;
    const channels = quality.channels === 'stereo' ? 2 : 1;
    let sizeBytes = 0;

    if (isLossless) {
      sizeBytes = durationSeconds * quality.sampleRate * channels * (quality.bitDepth / 8);
    } else {
      sizeBytes = durationSeconds * (quality.bitrate * 1000 / 8);
    }

    const sizeMB = sizeBytes / (1024 * 1024);
    return sizeMB < 1 ? `${(sizeMB * 1024).toFixed(0)} KB` : `${sizeMB.toFixed(1)} MB`;
  }, [quality, isLossless]);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid grid-cols-3 gap-3 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <HardDrive className="h-4 w-4" />
          <span>Est. Size: <span className="text-white font-medium">{estimatedFileSize}</span></span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Clock className="h-4 w-4" />
          <span>Duration: <span className="text-white font-medium">3:00</span></span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <AudioWaveform className="h-4 w-4" />
          <span>Channels: <span className="text-white font-medium capitalize">{quality.channels}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Sample Rate
          </Label>
          <Select
            value={quality.sampleRate.toString()}
            onValueChange={(v) => onQualityChange({ ...quality, sampleRate: parseInt(v) })}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {SAMPLE_RATES.map((rate) => (
                <SelectItem key={rate.value} value={rate.value.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{rate.label}</span>
                    <span className="text-xs text-zinc-500">{rate.description}</span>
                    {rate.recommended && (
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-green-900/30 text-green-400">
                        REC
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLossless ? (
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">Bit Depth</Label>
            <div className="grid grid-cols-3 gap-2">
              {BIT_DEPTHS.map((depth) => (
                <motion.button
                  key={depth.value}
                  type="button"
                  onClick={() => onQualityChange({ ...quality, bitDepth: depth.value })}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "p-2 rounded-lg border text-center transition-all relative",
                    quality.bitDepth === depth.value
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                  )}
                >
                  {depth.recommended && quality.bitDepth !== depth.value && (
                    <div className="absolute -top-1 -right-1">
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    </div>
                  )}
                  <span className="font-medium text-sm block">{depth.label}</span>
                  <span className="text-[10px] text-zinc-500 block">{depth.description}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-sm font-medium text-zinc-300">Bitrate</Label>
            <div className="space-y-4">
              <Slider
                value={[quality.bitrate]}
                onValueChange={([v]) => onQualityChange({ ...quality, bitrate: v })}
                min={128}
                max={320}
                step={64}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500">
                {BITRATES.map((rate) => (
                  <button
                    key={rate.value}
                    type="button"
                    onClick={() => onQualityChange({ ...quality, bitrate: rate.value })}
                    className={cn(
                      "px-2 py-1 rounded transition-colors",
                      quality.bitrate === rate.value
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'hover:text-white'
                    )}
                  >
                    {rate.label}
                  </button>
                ))}
              </div>
              <div className="text-center">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    quality.bitrate === 320 ? 'border-green-600 text-green-400' :
                    quality.bitrate === 256 ? 'border-blue-600 text-blue-400' :
                    quality.bitrate === 192 ? 'border-yellow-600 text-yellow-400' :
                    'border-zinc-600 text-zinc-400'
                  )}
                >
                  {BITRATES.find(r => r.value === quality.bitrate)?.quality || 'Custom'} Quality
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onQualityChange({ ...quality, channels: 'mono' })}
          className={cn(
            "flex-1 p-3 rounded-lg border text-center transition-all",
            quality.channels === 'mono'
              ? 'bg-blue-600/20 border-blue-500'
              : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
          )}
        >
          <AudioWaveform className="h-5 w-5 mx-auto mb-1 text-zinc-400" />
          <span className="font-medium text-sm block">Mono</span>
          <span className="text-[10px] text-zinc-500">Single channel</span>
        </button>
        <button
          type="button"
          onClick={() => onQualityChange({ ...quality, channels: 'stereo' })}
          className={cn(
            "flex-1 p-3 rounded-lg border text-center transition-all",
            quality.channels === 'stereo'
              ? 'bg-blue-600/20 border-blue-500'
              : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
          )}
        >
          <div className="flex justify-center gap-0.5 mb-1">
            <AudioWaveform className="h-5 w-5 text-zinc-400" />
            <AudioWaveform className="h-5 w-5 text-zinc-400" />
          </div>
          <span className="font-medium text-sm block">Stereo</span>
          <span className="text-[10px] text-zinc-500">Left + Right</span>
        </button>
      </div>

      {showAdvanced && processing && onProcessingChange && (
        <>
          <div className="border-t border-zinc-800 pt-6 space-y-4">
            <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              Processing Options
            </Label>

            <div className="grid gap-3">
              <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-3">
                  <Volume2 className="h-5 w-5 text-blue-400" />
                  <div>
                    <p className="font-medium text-sm">Normalize</p>
                    <p className="text-xs text-zinc-500">Adjust peak level to {processing.normalizeTarget} dB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onProcessingChange({ ...processing, normalize: !processing.normalize })}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    processing.normalize ? 'bg-blue-600' : 'bg-zinc-700'
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    processing.normalize ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>

              {processing.normalize && (
                <div className="pl-8 space-y-2">
                  <Label className="text-xs text-zinc-400">Target Level</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[processing.normalizeTarget]}
                      onValueChange={([v]) => onProcessingChange({ ...processing, normalizeTarget: v })}
                      min={-24}
                      max={0}
                      step={0.1}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-16 text-right">{processing.normalizeTarget.toFixed(1)} dB</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div>
                  <p className="font-medium text-sm">Dithering</p>
                  <p className="text-xs text-zinc-500">Add noise shaping for bit depth reduction</p>
                </div>
                <button
                  type="button"
                  onClick={() => onProcessingChange({ ...processing, dither: !processing.dither })}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    processing.dither ? 'bg-blue-600' : 'bg-zinc-700'
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    processing.dither ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div>
                  <p className="font-medium text-sm">Limiter</p>
                  <p className="text-xs text-zinc-500">Prevent clipping at {processing.limiterCeiling} dB ceiling</p>
                </div>
                <button
                  type="button"
                  onClick={() => onProcessingChange({ ...processing, limiter: !processing.limiter })}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    processing.limiter ? 'bg-blue-600' : 'bg-zinc-700'
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    processing.limiter ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export const MasteringPresetSelector = memo(function MasteringPresetSelector({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (preset: MasteringPreset) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <Label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-400" />
        Mastering Presets
      </Label>
      <div className="grid grid-cols-2 gap-2">
        {MASTERING_PRESETS.map((preset) => (
          <motion.button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "p-3 rounded-lg border text-left transition-all",
              value === preset.id
                ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500'
                : 'bg-zinc-900 border-zinc-700 hover:border-zinc-600'
            )}
          >
            <span className="font-medium text-sm block">{preset.name}</span>
            <span className="text-[10px] text-zinc-500 line-clamp-1">{preset.description}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
});

export default QualitySelector;
