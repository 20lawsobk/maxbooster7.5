// Plugin type definitions and built-in plugin data.
// Extracted from pluginHostService.ts to break circular imports.

export type PluginCategory = 'instrument' | 'effect';
export type InstrumentType =
  | 'piano' | 'strings' | 'drums' | 'bass' | 'pad' | 'synth' | 'analog' | 'fm' | 'wavetable' | 'sampler'
  | 'brass' | 'woodwind' | 'guitar' | 'organ' | 'vocal' | 'ethnic' | 'mallet' | 'bell';
export type EffectType =
  | 'reverb' | 'delay' | 'chorus' | 'compressor' | 'eq' | 'limiter' | 'gate' | 'distortion' | 'phaser' | 'flanger'
  | 'stereo' | 'microphone' | 'mastering' | 'mixing';

export interface PluginParameter {
  id: string;
  name: string;
  type: 'float' | 'int' | 'bool' | 'choice';
  defaultValue: number | boolean | string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  choices?: string[];
  unit?: string;
  automatable: boolean;
}

export interface PluginDefinition {
  id: string;
  slug: string;
  name: string;
  category: PluginCategory;
  type: InstrumentType | EffectType;
  version: string;
  description: string;
  author: string;
  parameters: PluginParameter[];
  defaultPreset: Record<string, number | boolean | string>;
  oscillators?: OscillatorConfig[];
  envelope?: EnvelopeConfig;
}

export interface OscillatorConfig {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  detune: number;
  gain: number;
}

export interface EnvelopeConfig {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface PluginInstance {
  id: string;
  pluginId: string;
  projectId: string;
  trackId?: string;
  chainPosition: number;
  parameters: Record<string, number | boolean | string>;
  bypassed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginPreset {
  id: string;
  userId: string;
  pluginId: string;
  name: string;
  category?: string;
  parameters: Record<string, number | boolean | string>;
  isDefault: boolean;
  isPublic: boolean;
  createdAt: Date;
}

export interface AudioBuffer {
  sampleRate: number;
  channels: number;
  length: number;
  data: Float32Array[];
}

export interface RenderContext {
  sampleRate: number;
  blockSize: number;
  currentTime: number;
  tempo: number;
}

export const BUILT_IN_INSTRUMENTS: PluginDefinition[] = [
  {
    id: 'mb-piano',
    slug: 'mb-piano',
    name: 'MB Piano',
    category: 'instrument',
    type: 'piano',
    version: '1.0.0',
    description: 'Virtual acoustic piano with realistic tone and dynamics',
    author: 'Max Booster',
    oscillators: [
      { type: 'triangle', detune: 0, gain: 0.6 },
      { type: 'sine', detune: 0.5, gain: 0.3 },
      { type: 'sine', detune: 1200, gain: 0.1 },
    ],
    envelope: { attack: 0.002, decay: 0.3, sustain: 0.6, release: 0.5 },
    parameters: [
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'dynamics', name: 'Dynamics', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.002, minValue: 0.001, maxValue: 0.5, unit: 's', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'reverb', name: 'Reverb Amount', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'tuning', name: 'Tuning', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, unit: 'cents', automatable: false },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brightness: 0.5, dynamics: 0.7, attack: 0.002, release: 0.5, reverb: 0.2, tuning: 0, volume: 0.8 },
  },
  {
    id: 'mb-strings',
    slug: 'mb-strings',
    name: 'MB Strings',
    category: 'instrument',
    type: 'strings',
    version: '1.0.0',
    description: 'Lush string ensemble with multiple articulations',
    author: 'Max Booster',
    oscillators: [
      { type: 'sawtooth', detune: -5, gain: 0.3 },
      { type: 'sawtooth', detune: 5, gain: 0.3 },
      { type: 'triangle', detune: 0, gain: 0.4 },
    ],
    envelope: { attack: 0.3, decay: 0.5, sustain: 0.8, release: 1.0 },
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.3, minValue: 0.01, maxValue: 2, unit: 's', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 1.0, minValue: 0.1, maxValue: 5, unit: 's', automatable: true },
      { id: 'warmth', name: 'Warmth', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'ensemble', name: 'Ensemble Width', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'expression', name: 'Expression', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0.3, release: 1.0, warmth: 0.6, ensemble: 0.5, vibrato: 0.3, expression: 1.0, volume: 0.8 },
  },
  {
    id: 'mb-drums',
    slug: 'mb-drums',
    name: 'MB Drums',
    category: 'instrument',
    type: 'drums',
    version: '1.0.0',
    description: 'Punchy drum kit with multiple kits and samples',
    author: 'Max Booster',
    oscillators: [
      { type: 'sine', detune: 0, gain: 1.0 },
      { type: 'noise', detune: 0, gain: 0.5 },
    ],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.3 },
    parameters: [
      { id: 'kit', name: 'Drum Kit', type: 'choice', defaultValue: 'acoustic', choices: ['acoustic', 'electronic', 'hip-hop', 'rock', 'jazz'], automatable: false },
      { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'tone', name: 'Tone', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 2, unit: 's', automatable: true },
      { id: 'overhead', name: 'Overhead Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'room', name: 'Room', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { kit: 'acoustic', punch: 0.7, tone: 0.5, decay: 0.5, overhead: 0.3, room: 0.2, volume: 0.8 },
  },
  {
    id: 'mb-bass',
    slug: 'mb-bass',
    name: 'MB Bass',
    category: 'instrument',
    type: 'bass',
    version: '1.0.0',
    description: 'Deep bass synthesizer with sub and harmonics',
    author: 'Max Booster',
    oscillators: [
      { type: 'sine', detune: 0, gain: 0.6 },
      { type: 'sawtooth', detune: -1200, gain: 0.3 },
      { type: 'square', detune: 0, gain: 0.1 },
    ],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.2 },
    parameters: [
      { id: 'sub', name: 'Sub Level', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'cutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 2000, minValue: 20, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.01, minValue: 0.001, maxValue: 0.5, unit: 's', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.2, minValue: 0.01, maxValue: 2, unit: 's', automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { sub: 0.7, drive: 0.3, cutoff: 2000, resonance: 0.3, attack: 0.01, release: 0.2, volume: 0.8 },
  },
  {
    id: 'mb-pad',
    slug: 'mb-pad',
    name: 'MB Synth Pad',
    category: 'instrument',
    type: 'pad',
    version: '1.0.0',
    description: 'Atmospheric pad synthesizer with rich textures',
    author: 'Max Booster',
    oscillators: [
      { type: 'sawtooth', detune: -7, gain: 0.25 },
      { type: 'sawtooth', detune: 7, gain: 0.25 },
      { type: 'sine', detune: 1200, gain: 0.2 },
      { type: 'triangle', detune: 0, gain: 0.3 },
    ],
    envelope: { attack: 0.8, decay: 1.0, sustain: 0.9, release: 2.0 },
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.8, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 2.0, minValue: 0.1, maxValue: 10, unit: 's', automatable: true },
      { id: 'detune', name: 'Detune', type: 'float', defaultValue: 7, minValue: 0, maxValue: 50, unit: 'cents', automatable: true },
      { id: 'filter', name: 'Filter Cutoff', type: 'float', defaultValue: 5000, minValue: 100, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'lfoRate', name: 'LFO Rate', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 10, unit: 'Hz', automatable: true },
      { id: 'lfoDepth', name: 'LFO Depth', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'chorus', name: 'Chorus', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0.8, release: 2.0, detune: 7, filter: 5000, lfoRate: 0.5, lfoDepth: 0.3, chorus: 0.4, volume: 0.7 },
  },
  {
    id: 'mb-analog-synth',
    slug: 'mb-analog-synth',
    name: 'MB Analog Synth',
    category: 'instrument',
    type: 'analog',
    version: '1.0.0',
    description: 'Classic analog synthesizer with dual oscillators, ladder filter, and modulation',
    author: 'Max Booster',
    oscillators: [
      { type: 'sawtooth', detune: 0, gain: 0.5 },
      { type: 'square', detune: -0.1, gain: 0.3 },
    ],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4 },
    parameters: [
      { id: 'osc1Wave', name: 'Osc 1 Wave', type: 'choice', defaultValue: 'sawtooth', choices: ['sine', 'square', 'sawtooth', 'triangle'], automatable: false },
      { id: 'osc1Detune', name: 'Osc 1 Detune', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, unit: 'cents', automatable: true },
      { id: 'osc1Level', name: 'Osc 1 Level', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'osc2Wave', name: 'Osc 2 Wave', type: 'choice', defaultValue: 'square', choices: ['sine', 'square', 'sawtooth', 'triangle'], automatable: false },
      { id: 'osc2Detune', name: 'Osc 2 Detune', type: 'float', defaultValue: 7, minValue: -100, maxValue: 100, unit: 'cents', automatable: true },
      { id: 'osc2Level', name: 'Osc 2 Level', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'oscMix', name: 'Oscillator Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'filterCutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 5000, minValue: 20, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'filterResonance', name: 'Filter Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'filterEnvAmount', name: 'Filter Env Amount', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'filterType', name: 'Filter Type', type: 'choice', defaultValue: 'lowpass', choices: ['lowpass', 'highpass', 'bandpass'], automatable: false },
      { id: 'lfoRate', name: 'LFO Rate', type: 'float', defaultValue: 2, minValue: 0.01, maxValue: 20, unit: 'Hz', automatable: true },
      { id: 'lfoDepth', name: 'LFO Depth', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'lfoTarget', name: 'LFO Target', type: 'choice', defaultValue: 'filter', choices: ['filter', 'pitch', 'amp'], automatable: false },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.01, minValue: 0.001, maxValue: 5, unit: 's', automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.3, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'sustain', name: 'Sustain', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.4, minValue: 0.01, maxValue: 10, unit: 's', automatable: true },
      { id: 'glide', name: 'Glide Time', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, unit: 's', automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: {
      osc1Wave: 'sawtooth', osc1Detune: 0, osc1Level: 0.5,
      osc2Wave: 'square', osc2Detune: 7, osc2Level: 0.3, oscMix: 0.5,
      filterCutoff: 5000, filterResonance: 0.3, filterEnvAmount: 0.5, filterType: 'lowpass',
      lfoRate: 2, lfoDepth: 0.2, lfoTarget: 'filter',
      attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4, glide: 0, volume: 0.8,
    },
  },
  {
    id: 'mb-fm-synth',
    slug: 'mb-fm-synth',
    name: 'MB FM Synth',
    category: 'instrument',
    type: 'fm',
    version: '1.0.0',
    description: 'FM synthesis engine with 4 operators for complex harmonic content',
    author: 'Max Booster',
    oscillators: [
      { type: 'sine', detune: 0, gain: 1.0 },
    ],
    envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.3 },
    parameters: [
      { id: 'algorithm', name: 'Algorithm', type: 'int', defaultValue: 1, minValue: 1, maxValue: 8, automatable: false },
      { id: 'op1Ratio', name: 'Op 1 Ratio', type: 'float', defaultValue: 1, minValue: 0.5, maxValue: 16, automatable: true },
      { id: 'op1Level', name: 'Op 1 Level', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'op2Ratio', name: 'Op 2 Ratio', type: 'float', defaultValue: 2, minValue: 0.5, maxValue: 16, automatable: true },
      { id: 'op2Level', name: 'Op 2 Level', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'op3Ratio', name: 'Op 3 Ratio', type: 'float', defaultValue: 3, minValue: 0.5, maxValue: 16, automatable: true },
      { id: 'op3Level', name: 'Op 3 Level', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'op4Ratio', name: 'Op 4 Ratio', type: 'float', defaultValue: 4, minValue: 0.5, maxValue: 16, automatable: true },
      { id: 'op4Level', name: 'Op 4 Level', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'modIndex', name: 'Modulation Index', type: 'float', defaultValue: 2.0, minValue: 0, maxValue: 10, automatable: true },
      { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.01, minValue: 0.001, maxValue: 5, unit: 's', automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'sustain', name: 'Sustain', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.3, minValue: 0.01, maxValue: 10, unit: 's', automatable: true },
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: {
      algorithm: 1, op1Ratio: 1, op1Level: 1.0, op2Ratio: 2, op2Level: 0.5,
      op3Ratio: 3, op3Level: 0.3, op4Ratio: 4, op4Level: 0.2,
      modIndex: 2.0, feedback: 0, attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.3,
      brightness: 0.5, volume: 0.8,
    },
  },
  {
    id: 'mb-wavetable-synth',
    slug: 'mb-wavetable-synth',
    name: 'MB Wavetable Synth',
    category: 'instrument',
    type: 'wavetable',
    version: '1.0.0',
    description: 'Modern wavetable synthesizer with morphing capabilities',
    author: 'Max Booster',
    oscillators: [
      { type: 'sine', detune: 0, gain: 1.0 },
    ],
    envelope: { attack: 0.05, decay: 0.4, sustain: 0.7, release: 0.5 },
    parameters: [
      { id: 'wavetable', name: 'Wavetable', type: 'choice', defaultValue: 'basic', choices: ['basic', 'digital', 'vocal', 'metallic', 'organic', 'chaos'], automatable: false },
      { id: 'wavePosition', name: 'Wave Position', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'morphSpeed', name: 'Morph Speed', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, unit: 'Hz', automatable: true },
      { id: 'unison', name: 'Unison Voices', type: 'int', defaultValue: 1, minValue: 1, maxValue: 8, automatable: false },
      { id: 'unisonDetune', name: 'Unison Detune', type: 'float', defaultValue: 10, minValue: 0, maxValue: 100, unit: 'cents', automatable: true },
      { id: 'unisonSpread', name: 'Unison Spread', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'filterCutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 8000, minValue: 20, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'filterResonance', name: 'Filter Resonance', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.05, minValue: 0.001, maxValue: 5, unit: 's', automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.4, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'sustain', name: 'Sustain', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 10, unit: 's', automatable: true },
      { id: 'lfoToPosition', name: 'LFO to Position', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'lfoRate', name: 'LFO Rate', type: 'float', defaultValue: 1, minValue: 0.01, maxValue: 20, unit: 'Hz', automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: {
      wavetable: 'basic', wavePosition: 0, morphSpeed: 0,
      unison: 1, unisonDetune: 10, unisonSpread: 0.5,
      filterCutoff: 8000, filterResonance: 0.2,
      attack: 0.05, decay: 0.4, sustain: 0.7, release: 0.5,
      lfoToPosition: 0, lfoRate: 1, volume: 0.8,
    },
  },
  {
    id: 'mb-sampler',
    slug: 'mb-sampler',
    name: 'MB Sampler',
    category: 'instrument',
    type: 'sampler',
    version: '1.0.0',
    description: 'Professional sampler with multi-sample support and advanced playback',
    author: 'Max Booster',
    oscillators: [],
    envelope: { attack: 0.001, decay: 0.1, sustain: 1.0, release: 0.2 },
    parameters: [
      { id: 'sampleBank', name: 'Sample Bank', type: 'choice', defaultValue: 'piano', choices: ['piano', 'strings', 'brass', 'woodwinds', 'choir', 'percussion', 'synth', 'custom'], automatable: false },
      { id: 'rootNote', name: 'Root Note', type: 'int', defaultValue: 60, minValue: 0, maxValue: 127, automatable: false },
      { id: 'pitchRange', name: 'Pitch Range', type: 'int', defaultValue: 24, minValue: 1, maxValue: 48, automatable: false },
      { id: 'startPoint', name: 'Start Point', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'endPoint', name: 'End Point', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true },
      { id: 'loopEnabled', name: 'Loop', type: 'bool', defaultValue: false, automatable: false },
      { id: 'loopStart', name: 'Loop Start', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'loopEnd', name: 'Loop End', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
      { id: 'loopCrossfade', name: 'Loop Crossfade', type: 'float', defaultValue: 0.02, minValue: 0, maxValue: 0.5, automatable: true },
      { id: 'playbackMode', name: 'Playback Mode', type: 'choice', defaultValue: 'oneshot', choices: ['oneshot', 'sustain', 'loop'], automatable: false },
      { id: 'velocitySensitivity', name: 'Velocity Sensitivity', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.001, minValue: 0.001, maxValue: 5, unit: 's', automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.1, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'sustain', name: 'Sustain', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.2, minValue: 0.01, maxValue: 10, unit: 's', automatable: true },
      { id: 'filterCutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 20000, minValue: 20, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'filterResonance', name: 'Filter Resonance', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'reverse', name: 'Reverse', type: 'bool', defaultValue: false, automatable: false },
      { id: 'timeStretch', name: 'Time Stretch', type: 'float', defaultValue: 1, minValue: 0.25, maxValue: 4, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: {
      sampleBank: 'piano', rootNote: 60, pitchRange: 24,
      startPoint: 0, endPoint: 1, loopEnabled: false,
      loopStart: 0.3, loopEnd: 0.9, loopCrossfade: 0.02,
      playbackMode: 'oneshot', velocitySensitivity: 0.8,
      attack: 0.001, decay: 0.1, sustain: 1.0, release: 0.2,
      filterCutoff: 20000, filterResonance: 0, reverse: false,
      timeStretch: 1, volume: 0.8,
    },
  },
];

export const BUILT_IN_EFFECTS: PluginDefinition[] = [
  {
    id: 'mb-reverb',
    slug: 'mb-reverb',
    name: 'MB Reverb',
    category: 'effect',
    type: 'reverb',
    version: '1.0.0',
    description: 'Algorithmic reverb with multiple room types',
    author: 'Max Booster',
    parameters: [
      { id: 'roomSize', name: 'Room Size', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'decay', name: 'Decay Time', type: 'float', defaultValue: 2.0, minValue: 0.1, maxValue: 20, unit: 's', automatable: true },
      { id: 'damping', name: 'Damping', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'preDelay', name: 'Pre-Delay', type: 'float', defaultValue: 20, minValue: 0, maxValue: 200, unit: 'ms', automatable: true },
      { id: 'diffusion', name: 'Diffusion', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'highCut', name: 'High Cut', type: 'float', defaultValue: 8000, minValue: 1000, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'lowCut', name: 'Low Cut', type: 'float', defaultValue: 100, minValue: 20, maxValue: 1000, unit: 'Hz', automatable: true },
      { id: 'mix', name: 'Dry/Wet Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { roomSize: 0.5, decay: 2.0, damping: 0.5, preDelay: 20, diffusion: 0.8, highCut: 8000, lowCut: 100, mix: 0.3 },
  },
  {
    id: 'mb-delay',
    slug: 'mb-delay',
    name: 'MB Delay',
    category: 'effect',
    type: 'delay',
    version: '1.0.0',
    description: 'Stereo delay with sync and modulation',
    author: 'Max Booster',
    parameters: [
      { id: 'timeLeft', name: 'Time Left', type: 'float', defaultValue: 250, minValue: 1, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'timeRight', name: 'Time Right', type: 'float', defaultValue: 375, minValue: 1, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'sync', name: 'Tempo Sync', type: 'bool', defaultValue: false, automatable: false },
      { id: 'syncNoteLeft', name: 'Sync Note L', type: 'choice', defaultValue: '1/4', choices: ['1/1', '1/2', '1/4', '1/8', '1/16', '1/4T', '1/8T'], automatable: false },
      { id: 'syncNoteRight', name: 'Sync Note R', type: 'choice', defaultValue: '1/4D', choices: ['1/1', '1/2', '1/4', '1/8', '1/16', '1/4D', '1/8D'], automatable: false },
      { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 0.95, automatable: true },
      { id: 'highCut', name: 'High Cut', type: 'float', defaultValue: 6000, minValue: 500, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'modRate', name: 'Mod Rate', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 5, unit: 'Hz', automatable: true },
      { id: 'modDepth', name: 'Mod Depth', type: 'float', defaultValue: 0.1, minValue: 0, maxValue: 1, automatable: true },
      { id: 'mix', name: 'Dry/Wet Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { timeLeft: 250, timeRight: 375, sync: false, syncNoteLeft: '1/4', syncNoteRight: '1/4D', feedback: 0.4, highCut: 6000, modRate: 0.5, modDepth: 0.1, mix: 0.3 },
  },
  {
    id: 'mb-chorus',
    slug: 'mb-chorus',
    name: 'MB Chorus',
    category: 'effect',
    type: 'chorus',
    version: '1.0.0',
    description: 'Rich stereo chorus effect',
    author: 'Max Booster',
    parameters: [
      { id: 'rate', name: 'Rate', type: 'float', defaultValue: 1.0, minValue: 0.1, maxValue: 10, unit: 'Hz', automatable: true },
      { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'delay', name: 'Delay', type: 'float', defaultValue: 7, minValue: 1, maxValue: 30, unit: 'ms', automatable: true },
      { id: 'voices', name: 'Voices', type: 'int', defaultValue: 3, minValue: 1, maxValue: 6, automatable: false },
      { id: 'spread', name: 'Stereo Spread', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'mix', name: 'Dry/Wet Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { rate: 1.0, depth: 0.5, delay: 7, voices: 3, spread: 0.7, mix: 0.5 },
  },
  {
    id: 'mb-compressor',
    slug: 'mb-compressor',
    name: 'MB Compressor',
    category: 'effect',
    type: 'compressor',
    version: '1.0.0',
    description: 'Professional dynamics compressor',
    author: 'Max Booster',
    parameters: [
      { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -20, minValue: -60, maxValue: 0, unit: 'dB', automatable: true },
      { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 4, minValue: 1, maxValue: 20, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 10, minValue: 0.1, maxValue: 200, unit: 'ms', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 100, minValue: 10, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'knee', name: 'Knee', type: 'float', defaultValue: 6, minValue: 0, maxValue: 20, unit: 'dB', automatable: true },
      { id: 'makeupGain', name: 'Makeup Gain', type: 'float', defaultValue: 0, minValue: -12, maxValue: 24, unit: 'dB', automatable: true },
      { id: 'autoMakeup', name: 'Auto Makeup', type: 'bool', defaultValue: true, automatable: false },
      { id: 'sidechain', name: 'Sidechain', type: 'bool', defaultValue: false, automatable: false },
      { id: 'mix', name: 'Dry/Wet Mix', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { threshold: -20, ratio: 4, attack: 10, release: 100, knee: 6, makeupGain: 0, autoMakeup: true, sidechain: false, mix: 1.0 },
  },
  {
    id: 'mb-eq',
    slug: 'mb-eq',
    name: 'MB Parametric EQ',
    category: 'effect',
    type: 'eq',
    version: '1.0.0',
    description: '3-band parametric equalizer',
    author: 'Max Booster',
    parameters: [
      { id: 'lowFreq', name: 'Low Freq', type: 'float', defaultValue: 80, minValue: 20, maxValue: 500, unit: 'Hz', automatable: true },
      { id: 'lowGain', name: 'Low Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, unit: 'dB', automatable: true },
      { id: 'lowQ', name: 'Low Q', type: 'float', defaultValue: 0.7, minValue: 0.1, maxValue: 10, automatable: true },
      { id: 'lowType', name: 'Low Type', type: 'choice', defaultValue: 'shelf', choices: ['shelf', 'peak', 'highpass'], automatable: false },
      { id: 'midFreq', name: 'Mid Freq', type: 'float', defaultValue: 1000, minValue: 100, maxValue: 10000, unit: 'Hz', automatable: true },
      { id: 'midGain', name: 'Mid Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, unit: 'dB', automatable: true },
      { id: 'midQ', name: 'Mid Q', type: 'float', defaultValue: 1.0, minValue: 0.1, maxValue: 10, automatable: true },
      { id: 'highFreq', name: 'High Freq', type: 'float', defaultValue: 8000, minValue: 2000, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'highGain', name: 'High Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, unit: 'dB', automatable: true },
      { id: 'highQ', name: 'High Q', type: 'float', defaultValue: 0.7, minValue: 0.1, maxValue: 10, automatable: true },
      { id: 'highType', name: 'High Type', type: 'choice', defaultValue: 'shelf', choices: ['shelf', 'peak', 'lowpass'], automatable: false },
      { id: 'outputGain', name: 'Output Gain', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, unit: 'dB', automatable: true },
    ],
    defaultPreset: { lowFreq: 80, lowGain: 0, lowQ: 0.7, lowType: 'shelf', midFreq: 1000, midGain: 0, midQ: 1.0, highFreq: 8000, highGain: 0, highQ: 0.7, highType: 'shelf', outputGain: 0 },
  },
  {
    id: 'mb-limiter',
    slug: 'mb-limiter',
    name: 'MB Limiter',
    category: 'effect',
    type: 'limiter',
    version: '1.0.0',
    description: 'Brickwall limiter for mastering',
    author: 'Max Booster',
    parameters: [
      { id: 'ceiling', name: 'Ceiling', type: 'float', defaultValue: -0.3, minValue: -6, maxValue: 0, unit: 'dB', automatable: true },
      { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -6, minValue: -24, maxValue: 0, unit: 'dB', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 100, minValue: 10, maxValue: 1000, unit: 'ms', automatable: true },
      { id: 'lookahead', name: 'Lookahead', type: 'float', defaultValue: 5, minValue: 0, maxValue: 20, unit: 'ms', automatable: false },
      { id: 'truePeak', name: 'True Peak', type: 'bool', defaultValue: true, automatable: false },
      { id: 'link', name: 'Stereo Link', type: 'bool', defaultValue: true, automatable: false },
    ],
    defaultPreset: { ceiling: -0.3, threshold: -6, release: 100, lookahead: 5, truePeak: true, link: true },
  },
  {
    id: 'mb-gate',
    slug: 'mb-gate',
    name: 'MB Noise Gate',
    category: 'effect',
    type: 'gate',
    version: '1.0.0',
    description: 'Noise gate with expander mode',
    author: 'Max Booster',
    parameters: [
      { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -40, minValue: -80, maxValue: 0, unit: 'dB', automatable: true },
      { id: 'range', name: 'Range', type: 'float', defaultValue: -80, minValue: -80, maxValue: 0, unit: 'dB', automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 1, minValue: 0.01, maxValue: 50, unit: 'ms', automatable: true },
      { id: 'hold', name: 'Hold', type: 'float', defaultValue: 50, minValue: 0, maxValue: 500, unit: 'ms', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 100, minValue: 10, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'hysteresis', name: 'Hysteresis', type: 'float', defaultValue: 3, minValue: 0, maxValue: 12, unit: 'dB', automatable: true },
      { id: 'sidechain', name: 'Sidechain', type: 'bool', defaultValue: false, automatable: false },
      { id: 'scFilter', name: 'SC Filter', type: 'float', defaultValue: 100, minValue: 20, maxValue: 5000, unit: 'Hz', automatable: true },
    ],
    defaultPreset: { threshold: -40, range: -80, attack: 1, hold: 50, release: 100, hysteresis: 3, sidechain: false, scFilter: 100 },
  },
  {
    id: 'mb-distortion',
    slug: 'mb-distortion',
    name: 'MB Distortion',
    category: 'effect',
    type: 'distortion',
    version: '1.0.0',
    description: 'Multi-mode distortion with tube, tape, and digital saturation',
    author: 'Max Booster',
    parameters: [
      { id: 'mode', name: 'Mode', type: 'choice', defaultValue: 'tube', choices: ['tube', 'tape', 'transistor', 'fuzz', 'bitcrush'], automatable: false },
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'tone', name: 'Tone', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'output', name: 'Output Level', type: 'float', defaultValue: 0, minValue: -24, maxValue: 12, unit: 'dB', automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'bias', name: 'Bias', type: 'float', defaultValue: 0, minValue: -1, maxValue: 1, automatable: true },
      { id: 'preFilterLow', name: 'Pre Low Cut', type: 'float', defaultValue: 20, minValue: 20, maxValue: 500, unit: 'Hz', automatable: true },
      { id: 'preFilterHigh', name: 'Pre High Cut', type: 'float', defaultValue: 20000, minValue: 1000, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'postFilterLow', name: 'Post Low Cut', type: 'float', defaultValue: 20, minValue: 20, maxValue: 500, unit: 'Hz', automatable: true },
      { id: 'postFilterHigh', name: 'Post High Cut', type: 'float', defaultValue: 20000, minValue: 1000, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'oversampling', name: 'Oversampling', type: 'choice', defaultValue: '2x', choices: ['off', '2x', '4x', '8x'], automatable: false },
    ],
    defaultPreset: { mode: 'tube', drive: 0.5, tone: 0.5, output: 0, mix: 1.0, bias: 0, preFilterLow: 20, preFilterHigh: 20000, postFilterLow: 20, postFilterHigh: 20000, oversampling: '2x' },
  },
  {
    id: 'mb-phaser',
    slug: 'mb-phaser',
    name: 'MB Phaser',
    category: 'effect',
    type: 'phaser',
    version: '1.0.0',
    description: 'Classic phaser with multiple stages and stereo modulation',
    author: 'Max Booster',
    parameters: [
      { id: 'rate', name: 'Rate', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 10, unit: 'Hz', automatable: true },
      { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 0.99, automatable: true },
      { id: 'stages', name: 'Stages', type: 'int', defaultValue: 4, minValue: 2, maxValue: 12, automatable: false },
      { id: 'centerFreq', name: 'Center Frequency', type: 'float', defaultValue: 1000, minValue: 100, maxValue: 5000, unit: 'Hz', automatable: true },
      { id: 'spread', name: 'Stereo Spread', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'lfoWave', name: 'LFO Wave', type: 'choice', defaultValue: 'sine', choices: ['sine', 'triangle', 'sample_hold'], automatable: false },
      { id: 'tempoSync', name: 'Tempo Sync', type: 'bool', defaultValue: false, automatable: false },
      { id: 'syncDivision', name: 'Sync Division', type: 'choice', defaultValue: '1/4', choices: ['1/16', '1/8', '1/4', '1/2', '1/1', '2/1'], automatable: false },
    ],
    defaultPreset: { rate: 0.5, depth: 0.7, feedback: 0.5, stages: 4, centerFreq: 1000, spread: 0.5, mix: 0.5, lfoWave: 'sine', tempoSync: false, syncDivision: '1/4' },
  },
  {
    id: 'mb-flanger',
    slug: 'mb-flanger',
    name: 'MB Flanger',
    category: 'effect',
    type: 'flanger',
    version: '1.0.0',
    description: 'Vintage flanger with through-zero capability',
    author: 'Max Booster',
    parameters: [
      { id: 'rate', name: 'Rate', type: 'float', defaultValue: 0.3, minValue: 0.01, maxValue: 10, unit: 'Hz', automatable: true },
      { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'delay', name: 'Delay', type: 'float', defaultValue: 5, minValue: 0.5, maxValue: 20, unit: 'ms', automatable: true },
      { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.5, minValue: -0.99, maxValue: 0.99, automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'stereoPhase', name: 'Stereo Phase', type: 'float', defaultValue: 0.25, minValue: 0, maxValue: 0.5, automatable: true },
      { id: 'throughZero', name: 'Through Zero', type: 'bool', defaultValue: false, automatable: false },
      { id: 'manualMode', name: 'Manual Mode', type: 'bool', defaultValue: false, automatable: false },
      { id: 'manualDelay', name: 'Manual Delay', type: 'float', defaultValue: 5, minValue: 0.1, maxValue: 20, unit: 'ms', automatable: true },
      { id: 'lfoWave', name: 'LFO Wave', type: 'choice', defaultValue: 'sine', choices: ['sine', 'triangle'], automatable: false },
      { id: 'tempoSync', name: 'Tempo Sync', type: 'bool', defaultValue: false, automatable: false },
    ],
    defaultPreset: { rate: 0.3, depth: 0.6, delay: 5, feedback: 0.5, mix: 0.5, stereoPhase: 0.25, throughZero: false, manualMode: false, manualDelay: 5, lfoWave: 'sine', tempoSync: false },
  },
];

export const EXPANDED_INSTRUMENTS: PluginDefinition[] = BUILT_IN_INSTRUMENTS;
export const EXPANDED_EFFECTS: PluginDefinition[] = BUILT_IN_EFFECTS;
export const ALL_PLUGINS: PluginDefinition[] = [...BUILT_IN_INSTRUMENTS, ...BUILT_IN_EFFECTS];
