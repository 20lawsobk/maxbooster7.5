import {
  Activity,
  Volume2,
  Waves,
  Clock,
  Sparkles,
  Music,
  Zap,
  Wind,
  Mic2,
  Filter,
  Piano,
  Drum,
  Guitar,
  Layers,
  Radio,
  Headphones,
  Speaker,
  AudioLines,
  AudioWaveform,
  Sliders,
  Settings,
  Wand2,
  Disc,
  Music2,
  Music3,
  Music4,
  Gauge,
} from 'lucide-react';
import React from 'react';

export interface PluginDefinition {
  id: string;
  name: string;
  type: 'effect' | 'instrument';
  subtype: string;
  description: string;
  icon: string;
  color: string;
  tags: string[];
  isFavorite?: boolean;
}

// ============================================
// EFFECTS CATALOG (100 plugins)
// ============================================

export const EFFECT_PLUGINS: PluginDefinition[] = [
  // === EQ (10) ===
  { id: 'mb-parametric-eq', name: 'Parametric EQ', type: 'effect', subtype: 'EQ', description: '8-band parametric equalizer with analyzer', icon: 'Activity', color: '#3b82f6', tags: ['eq', 'tone', 'frequency', 'mixing'] },
  { id: 'mb-graphic-eq', name: 'Graphic EQ', type: 'effect', subtype: 'EQ', description: '31-band graphic equalizer', icon: 'Activity', color: '#2563eb', tags: ['eq', 'graphic', 'frequency'] },
  { id: 'mb-dynamic-eq', name: 'Dynamic EQ', type: 'effect', subtype: 'EQ', description: 'Frequency-dependent dynamic processing', icon: 'Activity', color: '#1d4ed8', tags: ['eq', 'dynamics', 'surgical'] },
  { id: 'mb-linear-phase-eq', name: 'Linear Phase EQ', type: 'effect', subtype: 'EQ', description: 'Zero phase distortion mastering EQ', icon: 'Activity', color: '#1e40af', tags: ['eq', 'mastering', 'linear'] },
  { id: 'mb-vintage-eq', name: 'Vintage EQ', type: 'effect', subtype: 'EQ', description: 'Classic analog-modeled equalizer', icon: 'Activity', color: '#3730a3', tags: ['eq', 'vintage', 'analog'] },
  { id: 'mb-mastering-eq', name: 'Mastering EQ', type: 'effect', subtype: 'EQ', description: 'Precision mastering-grade equalizer', icon: 'Activity', color: '#4338ca', tags: ['eq', 'mastering', 'precision'] },
  { id: 'mb-mid-side-eq', name: 'Mid/Side EQ', type: 'effect', subtype: 'EQ', description: 'Mid/side processing equalizer', icon: 'Activity', color: '#4f46e5', tags: ['eq', 'mid-side', 'stereo'] },
  { id: 'mb-surgical-eq', name: 'Surgical EQ', type: 'effect', subtype: 'EQ', description: 'Ultra-precise frequency removal', icon: 'Activity', color: '#6366f1', tags: ['eq', 'surgical', 'notch'] },
  { id: 'mb-tilt-eq', name: 'Tilt EQ', type: 'effect', subtype: 'EQ', description: 'Single-knob tonal balance', icon: 'Activity', color: '#818cf8', tags: ['eq', 'tilt', 'simple'] },
  { id: 'mb-analog-eq', name: 'Analog EQ', type: 'effect', subtype: 'EQ', description: 'Warm analog character EQ', icon: 'Activity', color: '#a5b4fc', tags: ['eq', 'analog', 'warm'] },

  // === COMPRESSORS (10) ===
  { id: 'mb-vca-compressor', name: 'VCA Compressor', type: 'effect', subtype: 'Dynamics', description: 'Fast, punchy VCA-style compression', icon: 'Volume2', color: '#f59e0b', tags: ['dynamics', 'compression', 'punch'] },
  { id: 'mb-optical-compressor', name: 'Optical Compressor', type: 'effect', subtype: 'Dynamics', description: 'Smooth optical compression', icon: 'Volume2', color: '#d97706', tags: ['dynamics', 'opto', 'smooth'] },
  { id: 'mb-fet-compressor', name: 'FET Compressor', type: 'effect', subtype: 'Dynamics', description: 'Aggressive FET-style compression', icon: 'Volume2', color: '#b45309', tags: ['dynamics', 'fet', 'aggressive'] },
  { id: 'mb-tube-compressor', name: 'Tube Compressor', type: 'effect', subtype: 'Dynamics', description: 'Warm tube compression with harmonic saturation', icon: 'Volume2', color: '#92400e', tags: ['dynamics', 'tube', 'warm'] },
  { id: 'mb-multiband-compressor', name: 'Multiband Compressor', type: 'effect', subtype: 'Dynamics', description: '4-band multiband dynamics', icon: 'Volume2', color: '#78350f', tags: ['dynamics', 'multiband', 'mastering'] },
  { id: 'mb-parallel-compressor', name: 'Parallel Compressor', type: 'effect', subtype: 'Dynamics', description: 'New York-style parallel compression', icon: 'Volume2', color: '#fbbf24', tags: ['dynamics', 'parallel', 'punch'] },
  { id: 'mb-bus-compressor', name: 'Bus Compressor', type: 'effect', subtype: 'Dynamics', description: 'Glue compression for busses and stems', icon: 'Volume2', color: '#fcd34d', tags: ['dynamics', 'bus', 'glue'] },
  { id: 'mb-mastering-compressor', name: 'Mastering Compressor', type: 'effect', subtype: 'Dynamics', description: 'Transparent mastering compression', icon: 'Volume2', color: '#fde047', tags: ['dynamics', 'mastering', 'transparent'] },
  { id: 'mb-vintage-compressor', name: 'Vintage Compressor', type: 'effect', subtype: 'Dynamics', description: 'Classic vintage compression character', icon: 'Volume2', color: '#facc15', tags: ['dynamics', 'vintage', 'classic'] },
  { id: 'mb-glue-compressor', name: 'Glue Compressor', type: 'effect', subtype: 'Dynamics', description: 'SSL-style mix bus compression', icon: 'Volume2', color: '#eab308', tags: ['dynamics', 'glue', 'ssl'] },

  // === REVERB (10) ===
  { id: 'mb-plate-reverb', name: 'Plate Reverb', type: 'effect', subtype: 'Space', description: 'Classic plate reverb simulation', icon: 'Waves', color: '#8b5cf6', tags: ['reverb', 'plate', 'classic'] },
  { id: 'mb-hall-reverb', name: 'Hall Reverb', type: 'effect', subtype: 'Space', description: 'Large concert hall ambience', icon: 'Waves', color: '#7c3aed', tags: ['reverb', 'hall', 'ambient'] },
  { id: 'mb-room-reverb', name: 'Room Reverb', type: 'effect', subtype: 'Space', description: 'Natural room simulation', icon: 'Waves', color: '#6d28d9', tags: ['reverb', 'room', 'natural'] },
  { id: 'mb-chamber-reverb', name: 'Chamber Reverb', type: 'effect', subtype: 'Space', description: 'Studio chamber reverb', icon: 'Waves', color: '#5b21b6', tags: ['reverb', 'chamber', 'studio'] },
  { id: 'mb-spring-reverb', name: 'Spring Reverb', type: 'effect', subtype: 'Space', description: 'Classic spring reverb character', icon: 'Waves', color: '#4c1d95', tags: ['reverb', 'spring', 'vintage'] },
  { id: 'mb-shimmer-reverb', name: 'Shimmer Reverb', type: 'effect', subtype: 'Space', description: 'Ethereal pitch-shifted reverb', icon: 'Waves', color: '#a855f7', tags: ['reverb', 'shimmer', 'ambient'] },
  { id: 'mb-gated-reverb', name: 'Gated Reverb', type: 'effect', subtype: 'Space', description: '80s-style gated reverb', icon: 'Waves', color: '#9333ea', tags: ['reverb', 'gated', '80s'] },
  { id: 'mb-ambient-reverb', name: 'Ambient Reverb', type: 'effect', subtype: 'Space', description: 'Lush ambient textures', icon: 'Waves', color: '#7e22ce', tags: ['reverb', 'ambient', 'texture'] },
  { id: 'mb-cathedral-reverb', name: 'Cathedral Reverb', type: 'effect', subtype: 'Space', description: 'Massive cathedral space', icon: 'Waves', color: '#6b21a8', tags: ['reverb', 'cathedral', 'epic'] },
  { id: 'mb-vintage-reverb', name: 'Vintage Reverb', type: 'effect', subtype: 'Space', description: 'Classic analog reverb emulation', icon: 'Waves', color: '#581c87', tags: ['reverb', 'vintage', 'analog'] },

  // === DELAY (10) ===
  { id: 'mb-tape-delay', name: 'Tape Delay', type: 'effect', subtype: 'Time', description: 'Warm analog tape echo', icon: 'Clock', color: '#06b6d4', tags: ['delay', 'tape', 'analog'] },
  { id: 'mb-digital-delay', name: 'Digital Delay', type: 'effect', subtype: 'Time', description: 'Clean digital delay', icon: 'Clock', color: '#0891b2', tags: ['delay', 'digital', 'clean'] },
  { id: 'mb-ping-pong-delay', name: 'Ping Pong Delay', type: 'effect', subtype: 'Time', description: 'Stereo ping-pong echo', icon: 'Clock', color: '#0e7490', tags: ['delay', 'stereo', 'ping-pong'] },
  { id: 'mb-multi-tap-delay', name: 'Multi-Tap Delay', type: 'effect', subtype: 'Time', description: 'Complex rhythmic delays', icon: 'Clock', color: '#155e75', tags: ['delay', 'multi-tap', 'rhythmic'] },
  { id: 'mb-mod-delay', name: 'Modulated Delay', type: 'effect', subtype: 'Time', description: 'Delay with modulation effects', icon: 'Clock', color: '#164e63', tags: ['delay', 'modulation', 'chorus'] },
  { id: 'mb-slapback-delay', name: 'Slapback Delay', type: 'effect', subtype: 'Time', description: 'Quick rockabilly slapback', icon: 'Clock', color: '#22d3ee', tags: ['delay', 'slapback', 'short'] },
  { id: 'mb-filter-delay', name: 'Filter Delay', type: 'effect', subtype: 'Time', description: 'Delay with resonant filters', icon: 'Clock', color: '#67e8f9', tags: ['delay', 'filter', 'dub'] },
  { id: 'mb-granular-delay', name: 'Granular Delay', type: 'effect', subtype: 'Time', description: 'Granular texture delay', icon: 'Clock', color: '#a5f3fc', tags: ['delay', 'granular', 'texture'] },
  { id: 'mb-reverse-delay', name: 'Reverse Delay', type: 'effect', subtype: 'Time', description: 'Reverse echo effects', icon: 'Clock', color: '#cffafe', tags: ['delay', 'reverse', 'creative'] },
  { id: 'mb-ducking-delay', name: 'Ducking Delay', type: 'effect', subtype: 'Time', description: 'Side-chained delay ducking', icon: 'Clock', color: '#ecfeff', tags: ['delay', 'ducking', 'sidechain'] },

  // === DISTORTION (10) ===
  { id: 'mb-tube-distortion', name: 'Tube Distortion', type: 'effect', subtype: 'Saturation', description: 'Warm tube overdrive', icon: 'Sparkles', color: '#ef4444', tags: ['distortion', 'tube', 'warm'] },
  { id: 'mb-tape-distortion', name: 'Tape Saturation', type: 'effect', subtype: 'Saturation', description: 'Analog tape saturation', icon: 'Sparkles', color: '#dc2626', tags: ['distortion', 'tape', 'saturation'] },
  { id: 'mb-transistor-distortion', name: 'Transistor Distortion', type: 'effect', subtype: 'Saturation', description: 'Solid-state distortion', icon: 'Sparkles', color: '#b91c1c', tags: ['distortion', 'transistor', 'crisp'] },
  { id: 'mb-fuzz-distortion', name: 'Fuzz', type: 'effect', subtype: 'Saturation', description: 'Heavy fuzz pedal emulation', icon: 'Sparkles', color: '#991b1b', tags: ['distortion', 'fuzz', 'heavy'] },
  { id: 'mb-overdrive', name: 'Overdrive', type: 'effect', subtype: 'Saturation', description: 'Classic overdrive pedal', icon: 'Sparkles', color: '#7f1d1d', tags: ['distortion', 'overdrive', 'guitar'] },
  { id: 'mb-saturation', name: 'Saturation', type: 'effect', subtype: 'Saturation', description: 'Subtle harmonic saturation', icon: 'Sparkles', color: '#f87171', tags: ['saturation', 'harmonics', 'warmth'] },
  { id: 'mb-bitcrush', name: 'Bit Crusher', type: 'effect', subtype: 'Saturation', description: 'Lo-fi bit reduction', icon: 'Sparkles', color: '#fca5a5', tags: ['distortion', 'lofi', 'digital'] },
  { id: 'mb-waveshaper', name: 'Waveshaper', type: 'effect', subtype: 'Saturation', description: 'Custom waveshaping distortion', icon: 'Sparkles', color: '#fecaca', tags: ['distortion', 'waveshaper', 'creative'] },
  { id: 'mb-amp', name: 'Amp Simulator', type: 'effect', subtype: 'Saturation', description: 'Guitar amp modeling', icon: 'Sparkles', color: '#fee2e2', tags: ['distortion', 'amp', 'guitar'] },
  { id: 'mb-lofi', name: 'Lo-Fi', type: 'effect', subtype: 'Saturation', description: 'Vinyl and tape degradation', icon: 'Sparkles', color: '#fef2f2', tags: ['lofi', 'vinyl', 'degradation'] },

  // === MODULATION (10) ===
  { id: 'mb-chorus', name: 'Chorus', type: 'effect', subtype: 'Modulation', description: 'Rich stereo chorus', icon: 'Music', color: '#10b981', tags: ['chorus', 'modulation', 'stereo'] },
  { id: 'mb-flanger', name: 'Flanger', type: 'effect', subtype: 'Modulation', description: 'Classic flanging effect', icon: 'Zap', color: '#059669', tags: ['flanger', 'modulation', 'sweep'] },
  { id: 'mb-phaser', name: 'Phaser', type: 'effect', subtype: 'Modulation', description: 'Multi-stage phaser', icon: 'Wind', color: '#047857', tags: ['phaser', 'modulation', 'sweep'] },
  { id: 'mb-tremolo', name: 'Tremolo', type: 'effect', subtype: 'Modulation', description: 'Classic amplitude tremolo', icon: 'Music', color: '#065f46', tags: ['tremolo', 'modulation', 'amplitude'] },
  { id: 'mb-vibrato', name: 'Vibrato', type: 'effect', subtype: 'Modulation', description: 'Pitch vibrato effect', icon: 'Music', color: '#064e3b', tags: ['vibrato', 'modulation', 'pitch'] },
  { id: 'mb-rotary', name: 'Rotary Speaker', type: 'effect', subtype: 'Modulation', description: 'Leslie speaker emulation', icon: 'Music', color: '#34d399', tags: ['rotary', 'leslie', 'organ'] },
  { id: 'mb-auto-pan', name: 'Auto Pan', type: 'effect', subtype: 'Modulation', description: 'Automatic stereo panning', icon: 'Music', color: '#6ee7b7', tags: ['pan', 'stereo', 'modulation'] },
  { id: 'mb-ring-mod', name: 'Ring Modulator', type: 'effect', subtype: 'Modulation', description: 'Ring modulation effect', icon: 'Music', color: '#a7f3d0', tags: ['ring-mod', 'metallic', 'experimental'] },
  { id: 'mb-ensemble', name: 'Ensemble', type: 'effect', subtype: 'Modulation', description: 'String ensemble effect', icon: 'Music', color: '#d1fae5', tags: ['ensemble', 'strings', 'thick'] },
  { id: 'mb-dimension', name: 'Dimension', type: 'effect', subtype: 'Modulation', description: 'Spatial dimension expander', icon: 'Music', color: '#ecfdf5', tags: ['dimension', 'spatial', 'stereo'] },

  // === DYNAMICS (10) ===
  { id: 'mb-gate', name: 'Noise Gate', type: 'effect', subtype: 'Dynamics', description: 'Precision noise gate', icon: 'Filter', color: '#6366f1', tags: ['gate', 'dynamics', 'noise'] },
  { id: 'mb-limiter-pro', name: 'Limiter Pro', type: 'effect', subtype: 'Dynamics', description: 'Brickwall limiter for mastering', icon: 'Filter', color: '#4f46e5', tags: ['limiter', 'mastering', 'loudness'] },
  { id: 'mb-expander', name: 'Expander', type: 'effect', subtype: 'Dynamics', description: 'Downward expansion', icon: 'Filter', color: '#4338ca', tags: ['expander', 'dynamics', 'transients'] },
  { id: 'mb-transient-shaper', name: 'Transient Shaper', type: 'effect', subtype: 'Dynamics', description: 'Attack and sustain control', icon: 'Filter', color: '#3730a3', tags: ['transient', 'attack', 'punch'] },
  { id: 'mb-de-esser', name: 'De-Esser', type: 'effect', subtype: 'Dynamics', description: 'Vocal sibilance removal', icon: 'Mic2', color: '#312e81', tags: ['de-esser', 'vocal', 'sibilance'] },
  { id: 'mb-leveler', name: 'Leveler', type: 'effect', subtype: 'Dynamics', description: 'Automatic gain riding', icon: 'Filter', color: '#818cf8', tags: ['leveler', 'gain', 'automatic'] },
  { id: 'mb-maximizer', name: 'Maximizer', type: 'effect', subtype: 'Dynamics', description: 'Loudness maximizer', icon: 'Filter', color: '#a5b4fc', tags: ['maximizer', 'loudness', 'mastering'] },
  { id: 'mb-ducker', name: 'Ducker', type: 'effect', subtype: 'Dynamics', description: 'Sidechain ducking effect', icon: 'Filter', color: '#c7d2fe', tags: ['ducker', 'sidechain', 'ducking'] },
  { id: 'mb-envelope-follower', name: 'Envelope Follower', type: 'effect', subtype: 'Dynamics', description: 'Dynamic envelope following', icon: 'Filter', color: '#e0e7ff', tags: ['envelope', 'follower', 'modulation'] },
  { id: 'mb-pumper', name: 'Pumper', type: 'effect', subtype: 'Dynamics', description: 'Rhythmic sidechain pumping', icon: 'Filter', color: '#eef2ff', tags: ['pumper', 'sidechain', 'edm'] },

  // === VOCAL (10) ===
  { id: 'mb-vocal-compressor', name: 'Vocal Compressor', type: 'effect', subtype: 'Vocal', description: 'Optimized vocal dynamics', icon: 'Mic2', color: '#ec4899', tags: ['vocal', 'compressor', 'dynamics'] },
  { id: 'mb-vocal-eq', name: 'Vocal EQ', type: 'effect', subtype: 'Vocal', description: 'Vocal-tuned equalizer', icon: 'Mic2', color: '#db2777', tags: ['vocal', 'eq', 'tone'] },
  { id: 'mb-de-breath', name: 'De-Breath', type: 'effect', subtype: 'Vocal', description: 'Automatic breath removal', icon: 'Mic2', color: '#be185d', tags: ['vocal', 'breath', 'cleanup'] },
  { id: 'mb-vocal-doubler', name: 'Vocal Doubler', type: 'effect', subtype: 'Vocal', description: 'Automatic vocal doubling', icon: 'Mic2', color: '#9d174d', tags: ['vocal', 'doubler', 'thickening'] },
  { id: 'mb-harmony', name: 'Harmony', type: 'effect', subtype: 'Vocal', description: 'Intelligent harmony generation', icon: 'Mic2', color: '#831843', tags: ['vocal', 'harmony', 'pitch'] },
  { id: 'mb-auto-tune', name: 'Pitch Correction', type: 'effect', subtype: 'Vocal', description: 'Automatic pitch correction', icon: 'Mic2', color: '#f472b6', tags: ['vocal', 'pitch', 'tuning'] },
  { id: 'mb-formant-shifter', name: 'Formant Shifter', type: 'effect', subtype: 'Vocal', description: 'Vocal formant manipulation', icon: 'Mic2', color: '#f9a8d4', tags: ['vocal', 'formant', 'character'] },
  { id: 'mb-vocal-rider', name: 'Vocal Rider', type: 'effect', subtype: 'Vocal', description: 'Automatic vocal level riding', icon: 'Mic2', color: '#fbcfe8', tags: ['vocal', 'rider', 'automation'] },
  { id: 'mb-vocal-exciter', name: 'Vocal Exciter', type: 'effect', subtype: 'Vocal', description: 'Harmonic excitation for vocals', icon: 'Mic2', color: '#fce7f3', tags: ['vocal', 'exciter', 'presence'] },
  { id: 'mb-vocoder', name: 'Vocoder', type: 'effect', subtype: 'Vocal', description: 'Classic vocoder synthesis', icon: 'Mic2', color: '#fdf2f8', tags: ['vocoder', 'synth', 'robot'] },

  // === MICROPHONE (10) ===
  { id: 'mb-mic-preamp', name: 'Mic Preamp', type: 'effect', subtype: 'Mic', description: 'Vintage preamp emulation', icon: 'Headphones', color: '#14b8a6', tags: ['preamp', 'microphone', 'analog'] },
  { id: 'mb-channel-strip', name: 'Channel Strip', type: 'effect', subtype: 'Mic', description: 'Complete channel strip', icon: 'Headphones', color: '#0d9488', tags: ['channel', 'strip', 'console'] },
  { id: 'mb-u87-modeler', name: 'U87 Modeler', type: 'effect', subtype: 'Mic', description: 'Neumann U87 emulation', icon: 'Headphones', color: '#0f766e', tags: ['microphone', 'u87', 'modeling'] },
  { id: 'mb-sm7b-modeler', name: 'SM7B Modeler', type: 'effect', subtype: 'Mic', description: 'Shure SM7B emulation', icon: 'Headphones', color: '#115e59', tags: ['microphone', 'sm7b', 'modeling'] },
  { id: 'mb-sm58-modeler', name: 'SM58 Modeler', type: 'effect', subtype: 'Mic', description: 'Shure SM58 emulation', icon: 'Headphones', color: '#134e4a', tags: ['microphone', 'sm58', 'modeling'] },
  { id: 'mb-c414-modeler', name: 'C414 Modeler', type: 'effect', subtype: 'Mic', description: 'AKG C414 emulation', icon: 'Headphones', color: '#2dd4bf', tags: ['microphone', 'c414', 'modeling'] },
  { id: 'mb-ribbon-modeler', name: 'Ribbon Modeler', type: 'effect', subtype: 'Mic', description: 'Ribbon microphone character', icon: 'Headphones', color: '#5eead4', tags: ['microphone', 'ribbon', 'vintage'] },
  { id: 'mb-room-sim', name: 'Room Simulator', type: 'effect', subtype: 'Mic', description: 'Acoustic room simulation', icon: 'Headphones', color: '#99f6e4', tags: ['room', 'acoustic', 'simulation'] },
  { id: 'mb-mic-isolator', name: 'Mic Isolator', type: 'effect', subtype: 'Mic', description: 'Background noise isolation', icon: 'Headphones', color: '#ccfbf1', tags: ['isolation', 'noise', 'cleanup'] },
  { id: 'mb-plosive-reducer', name: 'Plosive Reducer', type: 'effect', subtype: 'Mic', description: 'Remove plosive pops', icon: 'Headphones', color: '#f0fdfa', tags: ['plosive', 'pop', 'cleanup'] },
];

// ============================================
// INSTRUMENTS CATALOG (100 instruments)
// ============================================

export const INSTRUMENT_PLUGINS: PluginDefinition[] = [
  // === PIANO (10) ===
  { id: 'grand-piano', name: 'Grand Piano', type: 'instrument', subtype: 'Piano', description: 'Concert grand piano', icon: 'Piano', color: '#f59e0b', tags: ['piano', 'grand', 'acoustic'] },
  { id: 'upright-piano', name: 'Upright Piano', type: 'instrument', subtype: 'Piano', description: 'Classic upright piano', icon: 'Piano', color: '#d97706', tags: ['piano', 'upright', 'acoustic'] },
  { id: 'electric-piano', name: 'Electric Piano', type: 'instrument', subtype: 'Piano', description: 'Rhodes and Wurlitzer', icon: 'Piano', color: '#b45309', tags: ['piano', 'electric', 'rhodes'] },
  { id: 'clavinet', name: 'Clavinet', type: 'instrument', subtype: 'Piano', description: 'Funky clavinet', icon: 'Piano', color: '#92400e', tags: ['clavinet', 'funk', 'keys'] },
  { id: 'honky-tonk', name: 'Honky Tonk', type: 'instrument', subtype: 'Piano', description: 'Detuned saloon piano', icon: 'Piano', color: '#78350f', tags: ['piano', 'honky-tonk', 'vintage'] },
  { id: 'toy-piano', name: 'Toy Piano', type: 'instrument', subtype: 'Piano', description: 'Cute toy piano', icon: 'Piano', color: '#fbbf24', tags: ['piano', 'toy', 'quirky'] },
  { id: 'tack-piano', name: 'Tack Piano', type: 'instrument', subtype: 'Piano', description: 'Bright tack piano', icon: 'Piano', color: '#fcd34d', tags: ['piano', 'tack', 'bright'] },
  { id: 'prepared-piano', name: 'Prepared Piano', type: 'instrument', subtype: 'Piano', description: 'Experimental prepared piano', icon: 'Piano', color: '#fde047', tags: ['piano', 'prepared', 'experimental'] },
  { id: 'felt-piano', name: 'Felt Piano', type: 'instrument', subtype: 'Piano', description: 'Soft felt-dampened piano', icon: 'Piano', color: '#facc15', tags: ['piano', 'felt', 'soft'] },
  { id: 'glass-piano', name: 'Glass Piano', type: 'instrument', subtype: 'Piano', description: 'Crystalline glass piano', icon: 'Piano', color: '#eab308', tags: ['piano', 'glass', 'ethereal'] },

  // === STRINGS (10) ===
  { id: 'orchestral-strings', name: 'Orchestral Strings', type: 'instrument', subtype: 'Strings', description: 'Full string orchestra', icon: 'Music', color: '#a855f7', tags: ['strings', 'orchestra', 'ensemble'] },
  { id: 'violin', name: 'Violin', type: 'instrument', subtype: 'Strings', description: 'Solo violin', icon: 'Music', color: '#9333ea', tags: ['strings', 'violin', 'solo'] },
  { id: 'viola', name: 'Viola', type: 'instrument', subtype: 'Strings', description: 'Solo viola', icon: 'Music', color: '#7e22ce', tags: ['strings', 'viola', 'solo'] },
  { id: 'cello', name: 'Cello', type: 'instrument', subtype: 'Strings', description: 'Solo cello', icon: 'Music', color: '#6b21a8', tags: ['strings', 'cello', 'solo'] },
  { id: 'contrabass', name: 'Contrabass', type: 'instrument', subtype: 'Strings', description: 'Double bass', icon: 'Music', color: '#581c87', tags: ['strings', 'bass', 'orchestra'] },
  { id: 'string-quartet', name: 'String Quartet', type: 'instrument', subtype: 'Strings', description: 'Intimate string quartet', icon: 'Music', color: '#c084fc', tags: ['strings', 'quartet', 'chamber'] },
  { id: 'cinematic-strings', name: 'Cinematic Strings', type: 'instrument', subtype: 'Strings', description: 'Epic cinematic strings', icon: 'Music', color: '#d8b4fe', tags: ['strings', 'cinematic', 'epic'] },
  { id: 'pizzicato-strings', name: 'Pizzicato Strings', type: 'instrument', subtype: 'Strings', description: 'Plucked strings', icon: 'Music', color: '#e9d5ff', tags: ['strings', 'pizzicato', 'plucked'] },
  { id: 'tremolo-strings', name: 'Tremolo Strings', type: 'instrument', subtype: 'Strings', description: 'Tremolo string texture', icon: 'Music', color: '#f3e8ff', tags: ['strings', 'tremolo', 'texture'] },
  { id: 'synth-strings', name: 'Synth Strings', type: 'instrument', subtype: 'Strings', description: 'Synthesized strings', icon: 'Music', color: '#faf5ff', tags: ['strings', 'synth', 'retro'] },

  // === DRUMS (10) ===
  { id: 'acoustic-drums', name: 'Acoustic Drums', type: 'instrument', subtype: 'Drums', description: 'Full acoustic drum kit', icon: 'Drum', color: '#ef4444', tags: ['drums', 'acoustic', 'kit'] },
  { id: 'electronic-drums', name: 'Electronic Drums', type: 'instrument', subtype: 'Drums', description: 'Electronic drum sounds', icon: 'Drum', color: '#dc2626', tags: ['drums', 'electronic', 'synth'] },
  { id: 'breakbeat-drums', name: 'Breakbeat Drums', type: 'instrument', subtype: 'Drums', description: 'Classic breakbeat samples', icon: 'Drum', color: '#b91c1c', tags: ['drums', 'breakbeat', 'dnb'] },
  { id: 'trap-drums', name: 'Trap Drums', type: 'instrument', subtype: 'Drums', description: 'Modern trap drum kit', icon: 'Drum', color: '#991b1b', tags: ['drums', 'trap', 'hiphop'] },
  { id: 'jazz-drums', name: 'Jazz Drums', type: 'instrument', subtype: 'Drums', description: 'Brushed jazz kit', icon: 'Drum', color: '#7f1d1d', tags: ['drums', 'jazz', 'brushes'] },
  { id: 'rock-drums', name: 'Rock Drums', type: 'instrument', subtype: 'Drums', description: 'Punchy rock kit', icon: 'Drum', color: '#f87171', tags: ['drums', 'rock', 'power'] },
  { id: 'percussion', name: 'Percussion', type: 'instrument', subtype: 'Drums', description: 'World percussion', icon: 'Drum', color: '#fca5a5', tags: ['percussion', 'world', 'ethnic'] },
  { id: 'industrial-drums', name: 'Industrial Drums', type: 'instrument', subtype: 'Drums', description: 'Heavy industrial kit', icon: 'Drum', color: '#fecaca', tags: ['drums', 'industrial', 'heavy'] },
  { id: 'lofi-drums', name: 'Lo-Fi Drums', type: 'instrument', subtype: 'Drums', description: 'Vintage lo-fi drums', icon: 'Drum', color: '#fee2e2', tags: ['drums', 'lofi', 'vintage'] },
  { id: 'orchestral-drums', name: 'Orchestral Drums', type: 'instrument', subtype: 'Drums', description: 'Orchestral percussion', icon: 'Drum', color: '#fef2f2', tags: ['drums', 'orchestral', 'timpani'] },

  // === BASS (10) ===
  { id: 'electric-bass', name: 'Electric Bass', type: 'instrument', subtype: 'Bass', description: 'Fender-style electric bass', icon: 'Guitar', color: '#3b82f6', tags: ['bass', 'electric', 'fender'] },
  { id: 'synth-bass', name: 'Synth Bass', type: 'instrument', subtype: 'Bass', description: 'Classic synth bass', icon: 'Guitar', color: '#2563eb', tags: ['bass', 'synth', 'analog'] },
  { id: 'acoustic-bass', name: 'Acoustic Bass', type: 'instrument', subtype: 'Bass', description: 'Upright acoustic bass', icon: 'Guitar', color: '#1d4ed8', tags: ['bass', 'acoustic', 'upright'] },
  { id: 'sub-bass', name: 'Sub Bass', type: 'instrument', subtype: 'Bass', description: 'Deep sub-bass synth', icon: 'Guitar', color: '#1e40af', tags: ['bass', 'sub', 'deep'] },
  { id: 'wobble-bass', name: 'Wobble Bass', type: 'instrument', subtype: 'Bass', description: 'Dubstep wobble bass', icon: 'Guitar', color: '#1e3a8a', tags: ['bass', 'wobble', 'dubstep'] },
  { id: 'funk-bass', name: 'Funk Bass', type: 'instrument', subtype: 'Bass', description: 'Slap and pop funk bass', icon: 'Guitar', color: '#60a5fa', tags: ['bass', 'funk', 'slap'] },
  { id: 'reese-bass', name: 'Reese Bass', type: 'instrument', subtype: 'Bass', description: 'Classic reese bass', icon: 'Guitar', color: '#93c5fd', tags: ['bass', 'reese', 'dnb'] },
  { id: 'fm-bass', name: 'FM Bass', type: 'instrument', subtype: 'Bass', description: 'FM synthesis bass', icon: 'Guitar', color: '#bfdbfe', tags: ['bass', 'fm', 'digital'] },
  { id: 'pluck-bass', name: 'Pluck Bass', type: 'instrument', subtype: 'Bass', description: 'Plucky synth bass', icon: 'Guitar', color: '#dbeafe', tags: ['bass', 'pluck', 'synth'] },
  { id: 'growl-bass', name: 'Growl Bass', type: 'instrument', subtype: 'Bass', description: 'Aggressive growl bass', icon: 'Guitar', color: '#eff6ff', tags: ['bass', 'growl', 'aggressive'] },

  // === PADS (10) ===
  { id: 'warm-pad', name: 'Warm Pad', type: 'instrument', subtype: 'Pads', description: 'Warm analog pad', icon: 'Waves', color: '#ec4899', tags: ['pad', 'warm', 'analog'] },
  { id: 'string-pad', name: 'String Pad', type: 'instrument', subtype: 'Pads', description: 'Lush string ensemble pad', icon: 'Waves', color: '#db2777', tags: ['pad', 'strings', 'lush'] },
  { id: 'choir-pad', name: 'Choir Pad', type: 'instrument', subtype: 'Pads', description: 'Ethereal choir pad', icon: 'Waves', color: '#be185d', tags: ['pad', 'choir', 'ethereal'] },
  { id: 'glass-pad', name: 'Glass Pad', type: 'instrument', subtype: 'Pads', description: 'Crystalline glass pad', icon: 'Waves', color: '#9d174d', tags: ['pad', 'glass', 'bright'] },
  { id: 'dark-pad', name: 'Dark Pad', type: 'instrument', subtype: 'Pads', description: 'Dark atmospheric pad', icon: 'Waves', color: '#831843', tags: ['pad', 'dark', 'atmospheric'] },
  { id: 'evolving-pad', name: 'Evolving Pad', type: 'instrument', subtype: 'Pads', description: 'Moving evolving textures', icon: 'Waves', color: '#f472b6', tags: ['pad', 'evolving', 'texture'] },
  { id: 'noise-pad', name: 'Noise Pad', type: 'instrument', subtype: 'Pads', description: 'Noise-based texture pad', icon: 'Waves', color: '#f9a8d4', tags: ['pad', 'noise', 'texture'] },
  { id: 'brass-pad', name: 'Brass Pad', type: 'instrument', subtype: 'Pads', description: 'Soft brass section pad', icon: 'Waves', color: '#fbcfe8', tags: ['pad', 'brass', 'soft'] },
  { id: 'digital-pad', name: 'Digital Pad', type: 'instrument', subtype: 'Pads', description: 'Digital synth pad', icon: 'Waves', color: '#fce7f3', tags: ['pad', 'digital', 'synth'] },
  { id: 'space-pad', name: 'Space Pad', type: 'instrument', subtype: 'Pads', description: 'Cosmic space pad', icon: 'Waves', color: '#fdf2f8', tags: ['pad', 'space', 'cosmic'] },

  // === ANALOG SYNTHS (10) ===
  { id: 'minimoog', name: 'Minimoog', type: 'instrument', subtype: 'Synth', description: 'Classic Minimoog emulation', icon: 'Waves', color: '#8b5cf6', tags: ['synth', 'minimoog', 'analog'] },
  { id: 'prophet', name: 'Prophet', type: 'instrument', subtype: 'Synth', description: 'Prophet-5 style synth', icon: 'Waves', color: '#7c3aed', tags: ['synth', 'prophet', 'analog'] },
  { id: 'jupiter', name: 'Jupiter', type: 'instrument', subtype: 'Synth', description: 'Jupiter-8 emulation', icon: 'Waves', color: '#6d28d9', tags: ['synth', 'jupiter', 'analog'] },
  { id: 'oberheim', name: 'Oberheim', type: 'instrument', subtype: 'Synth', description: 'Oberheim OB-X style', icon: 'Waves', color: '#5b21b6', tags: ['synth', 'oberheim', 'analog'] },
  { id: 'arp-2600', name: 'ARP 2600', type: 'instrument', subtype: 'Synth', description: 'ARP 2600 semi-modular', icon: 'Waves', color: '#4c1d95', tags: ['synth', 'arp', 'modular'] },
  { id: 'sh-101', name: 'SH-101', type: 'instrument', subtype: 'Synth', description: 'Roland SH-101 bass synth', icon: 'Waves', color: '#a78bfa', tags: ['synth', 'sh101', 'bass'] },
  { id: 'juno', name: 'Juno', type: 'instrument', subtype: 'Synth', description: 'Roland Juno-106 style', icon: 'Waves', color: '#c4b5fd', tags: ['synth', 'juno', 'chorus'] },
  { id: 'ms-20', name: 'MS-20', type: 'instrument', subtype: 'Synth', description: 'Korg MS-20 character', icon: 'Waves', color: '#ddd6fe', tags: ['synth', 'ms20', 'aggressive'] },
  { id: 'odyssey', name: 'Odyssey', type: 'instrument', subtype: 'Synth', description: 'ARP Odyssey duophonic', icon: 'Waves', color: '#ede9fe', tags: ['synth', 'odyssey', 'duophonic'] },
  { id: 'polysix', name: 'PolySix', type: 'instrument', subtype: 'Synth', description: 'Korg PolySix emulation', icon: 'Waves', color: '#f5f3ff', tags: ['synth', 'polysix', 'poly'] },

  // === FM SYNTHS (10) ===
  { id: 'dx7-bell', name: 'DX7 Bell', type: 'instrument', subtype: 'FM', description: 'Classic FM bell sounds', icon: 'Waves', color: '#06b6d4', tags: ['fm', 'bell', 'dx7'] },
  { id: 'dx7-bass', name: 'DX7 Bass', type: 'instrument', subtype: 'FM', description: 'Punchy FM bass', icon: 'Waves', color: '#0891b2', tags: ['fm', 'bass', 'dx7'] },
  { id: 'dx7-epiano', name: 'DX7 E-Piano', type: 'instrument', subtype: 'FM', description: 'FM electric piano', icon: 'Waves', color: '#0e7490', tags: ['fm', 'epiano', 'dx7'] },
  { id: 'dx7-brass', name: 'DX7 Brass', type: 'instrument', subtype: 'FM', description: 'FM brass stabs', icon: 'Waves', color: '#155e75', tags: ['fm', 'brass', 'dx7'] },
  { id: 'dx7-pad', name: 'DX7 Pad', type: 'instrument', subtype: 'FM', description: 'Evolving FM pads', icon: 'Waves', color: '#164e63', tags: ['fm', 'pad', 'dx7'] },
  { id: 'dx7-lead', name: 'DX7 Lead', type: 'instrument', subtype: 'FM', description: 'Expressive FM leads', icon: 'Waves', color: '#22d3ee', tags: ['fm', 'lead', 'dx7'] },
  { id: 'dx7-keys', name: 'DX7 Keys', type: 'instrument', subtype: 'FM', description: 'FM keyboard sounds', icon: 'Waves', color: '#67e8f9', tags: ['fm', 'keys', 'dx7'] },
  { id: 'dx7-perc', name: 'DX7 Percussion', type: 'instrument', subtype: 'FM', description: 'FM percussion and mallets', icon: 'Waves', color: '#a5f3fc', tags: ['fm', 'percussion', 'dx7'] },
  { id: 'fm8', name: 'FM8', type: 'instrument', subtype: 'FM', description: 'Modern FM synthesis', icon: 'Waves', color: '#cffafe', tags: ['fm', 'modern', 'digital'] },
  { id: 'modular-fm', name: 'Modular FM', type: 'instrument', subtype: 'FM', description: 'Complex modular FM', icon: 'Waves', color: '#ecfeff', tags: ['fm', 'modular', 'complex'] },

  // === WAVETABLE SYNTHS (10) ===
  { id: 'serum', name: 'Serum', type: 'instrument', subtype: 'Wavetable', description: 'Modern wavetable synth', icon: 'Waves', color: '#10b981', tags: ['wavetable', 'modern', 'serum'] },
  { id: 'massive', name: 'Massive', type: 'instrument', subtype: 'Wavetable', description: 'Heavy wavetable bass', icon: 'Waves', color: '#059669', tags: ['wavetable', 'massive', 'bass'] },
  { id: 'synthwave', name: 'Synthwave', type: 'instrument', subtype: 'Wavetable', description: 'Retro synthwave sounds', icon: 'Waves', color: '#047857', tags: ['wavetable', 'synthwave', 'retro'] },
  { id: 'vocal-wavetable', name: 'Vocal Wavetable', type: 'instrument', subtype: 'Wavetable', description: 'Vocal formant wavetables', icon: 'Waves', color: '#065f46', tags: ['wavetable', 'vocal', 'formant'] },
  { id: 'organic-wavetable', name: 'Organic Wavetable', type: 'instrument', subtype: 'Wavetable', description: 'Organic natural wavetables', icon: 'Waves', color: '#064e3b', tags: ['wavetable', 'organic', 'natural'] },
  { id: 'digital-wavetable', name: 'Digital Wavetable', type: 'instrument', subtype: 'Wavetable', description: 'Sharp digital wavetables', icon: 'Waves', color: '#34d399', tags: ['wavetable', 'digital', 'sharp'] },
  { id: 'ppg', name: 'PPG Wave', type: 'instrument', subtype: 'Wavetable', description: 'Classic PPG wavetable', icon: 'Waves', color: '#6ee7b7', tags: ['wavetable', 'ppg', 'vintage'] },
  { id: 'microtonal', name: 'Microtonal', type: 'instrument', subtype: 'Wavetable', description: 'Microtonal wavetables', icon: 'Waves', color: '#a7f3d0', tags: ['wavetable', 'microtonal', 'experimental'] },
  { id: 'hybrid', name: 'Hybrid Synth', type: 'instrument', subtype: 'Wavetable', description: 'Hybrid analog + wavetable', icon: 'Waves', color: '#d1fae5', tags: ['wavetable', 'hybrid', 'analog'] },
  { id: 'granular-wavetable', name: 'Granular Wavetable', type: 'instrument', subtype: 'Wavetable', description: 'Granular wavetable textures', icon: 'Waves', color: '#ecfdf5', tags: ['wavetable', 'granular', 'texture'] },

  // === SAMPLERS (10) ===
  { id: 'basic-sampler', name: 'Basic Sampler', type: 'instrument', subtype: 'Sampler', description: 'Simple sample playback', icon: 'Layers', color: '#f97316', tags: ['sampler', 'basic', 'playback'] },
  { id: 'multisample', name: 'Multisample', type: 'instrument', subtype: 'Sampler', description: 'Multi-velocity sampler', icon: 'Layers', color: '#ea580c', tags: ['sampler', 'multi', 'velocity'] },
  { id: 'granular-sampler', name: 'Granular Sampler', type: 'instrument', subtype: 'Sampler', description: 'Granular sample manipulation', icon: 'Layers', color: '#c2410c', tags: ['sampler', 'granular', 'texture'] },
  { id: 'stretch-sampler', name: 'Stretch Sampler', type: 'instrument', subtype: 'Sampler', description: 'Time-stretch sampler', icon: 'Layers', color: '#9a3412', tags: ['sampler', 'stretch', 'timestretch'] },
  { id: 'slicer', name: 'Slicer', type: 'instrument', subtype: 'Sampler', description: 'Beat slicer and rearranger', icon: 'Layers', color: '#7c2d12', tags: ['sampler', 'slicer', 'beats'] },
  { id: 'rompler', name: 'ROMpler', type: 'instrument', subtype: 'Sampler', description: 'Classic ROMpler sounds', icon: 'Layers', color: '#fb923c', tags: ['sampler', 'rompler', 'preset'] },
  { id: 'looper', name: 'Looper', type: 'instrument', subtype: 'Sampler', description: 'Live loop sampler', icon: 'Layers', color: '#fdba74', tags: ['sampler', 'looper', 'live'] },
  { id: 'texture-sampler', name: 'Texture Sampler', type: 'instrument', subtype: 'Sampler', description: 'Ambient texture sampler', icon: 'Layers', color: '#fed7aa', tags: ['sampler', 'texture', 'ambient'] },
  { id: 'resynthesis', name: 'Resynthesis', type: 'instrument', subtype: 'Sampler', description: 'Spectral resynthesis', icon: 'Layers', color: '#ffedd5', tags: ['sampler', 'resynthesis', 'spectral'] },
  { id: 'voice-sampler', name: 'Voice Sampler', type: 'instrument', subtype: 'Sampler', description: 'Vocal sample player', icon: 'Layers', color: '#fff7ed', tags: ['sampler', 'voice', 'vocal'] },
];

// Combined catalog
export const ALL_PLUGINS: PluginDefinition[] = [...EFFECT_PLUGINS, ...INSTRUMENT_PLUGINS];

// Utility functions
export function getPluginById(id: string): PluginDefinition | undefined {
  return ALL_PLUGINS.find(p => p.id === id);
}

export function getPluginsByType(type: 'effect' | 'instrument'): PluginDefinition[] {
  return ALL_PLUGINS.filter(p => p.type === type);
}

export function getPluginsBySubtype(subtype: string): PluginDefinition[] {
  return ALL_PLUGINS.filter(p => p.subtype === subtype);
}

export function searchPlugins(query: string): PluginDefinition[] {
  const lowerQuery = query.toLowerCase();
  return ALL_PLUGINS.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.description.toLowerCase().includes(lowerQuery) ||
    p.tags.some(t => t.includes(lowerQuery))
  );
}

// Export counts for verification
export const PLUGIN_COUNTS = {
  effects: EFFECT_PLUGINS.length,
  instruments: INSTRUMENT_PLUGINS.length,
  total: ALL_PLUGINS.length,
};
