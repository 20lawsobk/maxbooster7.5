import { db } from '../db';
import { pluginCatalog, pluginInstances, pluginPresets } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { logger } from '../logger.js';
import { EXPANDED_INSTRUMENTS, EXPANDED_EFFECTS, ALL_PLUGINS } from './plugins/index';
import { 
  getEffectProcessor, 
  getInstrumentSynthesizer, 
  getProcessorInfo,
  type DSPProcessor,
  type SynthesizerEngine 
} from './dsp/index';

export type PluginCategory = 'instrument' | 'effect';
export type InstrumentType = 'piano' | 'strings' | 'drums' | 'bass' | 'pad' | 'synth' | 'analog' | 'fm' | 'wavetable' | 'sampler';
export type EffectType = 'reverb' | 'delay' | 'chorus' | 'compressor' | 'eq' | 'limiter' | 'gate' | 'distortion' | 'phaser' | 'flanger';

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

const BUILT_IN_INSTRUMENTS: PluginDefinition[] = [
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

const BUILT_IN_EFFECTS: PluginDefinition[] = [
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

class PluginHostService {
  private instanceCache: Map<string, PluginInstance> = new Map();
  private sandboxContexts: Map<string, RenderContext> = new Map();

  getAllPlugins(): PluginDefinition[] {
    return ALL_PLUGINS;
  }

  getPluginsByCategory(category: PluginCategory): PluginDefinition[] {
    if (category === 'instrument') {
      return EXPANDED_INSTRUMENTS;
    }
    return EXPANDED_EFFECTS;
  }

  getPluginById(pluginId: string): PluginDefinition | undefined {
    return this.getAllPlugins().find(p => p.id === pluginId || p.slug === pluginId);
  }

  async ensurePluginCatalogSeeded(): Promise<void> {
    try {
      const existing = await db.query.pluginCatalog.findFirst();
      if (existing) {
        return;
      }

      const allPlugins = this.getAllPlugins();
      for (const plugin of allPlugins) {
        await db.insert(pluginCatalog).values({
          slug: plugin.slug,
          name: plugin.name,
          kind: plugin.category,
          version: plugin.version,
          manifest: {
            description: plugin.description,
            author: plugin.author,
            type: plugin.type,
            parameters: plugin.parameters,
            defaultPreset: plugin.defaultPreset,
            oscillators: plugin.oscillators,
            envelope: plugin.envelope,
          },
        }).onConflictDoNothing();
      }
      logger.info(`Seeded ${allPlugins.length} plugins to catalog`);
    } catch (error) {
      logger.error('Error seeding plugin catalog:', error);
    }
  }

  async createInstance(
    pluginId: string,
    projectId: string,
    trackId: string | undefined,
    chainPosition: number,
    initialParams?: Record<string, number | boolean | string>
  ): Promise<PluginInstance> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const params = { ...plugin.defaultPreset, ...initialParams };
    
    const catalogEntry = await db.query.pluginCatalog.findFirst({
      where: eq(pluginCatalog.slug, plugin.slug),
    });

    if (!catalogEntry) {
      await this.ensurePluginCatalogSeeded();
    }

    const [instance] = await db.insert(pluginInstances).values({
      projectId,
      trackId: trackId || null,
      catalogId: catalogEntry?.id || pluginId,
      index: chainPosition,
      params,
      bypassed: false,
    }).returning();

    const pluginInstance: PluginInstance = {
      id: instance.id,
      pluginId,
      projectId,
      trackId: trackId || undefined,
      chainPosition,
      parameters: params,
      bypassed: false,
      createdAt: instance.createdAt || new Date(),
      updatedAt: instance.updatedAt || new Date(),
    };

    this.instanceCache.set(instance.id, pluginInstance);
    this.initializeSandbox(instance.id);

    return pluginInstance;
  }

  async getInstance(instanceId: string): Promise<PluginInstance | undefined> {
    if (this.instanceCache.has(instanceId)) {
      return this.instanceCache.get(instanceId);
    }

    const instance = await db.query.pluginInstances.findFirst({
      where: eq(pluginInstances.id, instanceId),
    });

    if (!instance) {
      return undefined;
    }

    const catalog = await db.query.pluginCatalog.findFirst({
      where: eq(pluginCatalog.id, instance.catalogId),
    });

    const pluginInstance: PluginInstance = {
      id: instance.id,
      pluginId: catalog?.slug || instance.catalogId,
      projectId: instance.projectId,
      trackId: instance.trackId || undefined,
      chainPosition: instance.index,
      parameters: (instance.params as Record<string, number | boolean | string>) || {},
      bypassed: instance.bypassed || false,
      createdAt: instance.createdAt || new Date(),
      updatedAt: instance.updatedAt || new Date(),
    };

    this.instanceCache.set(instanceId, pluginInstance);
    return pluginInstance;
  }

  async updateInstanceParameters(
    instanceId: string,
    parameters: Partial<Record<string, number | boolean | string>>
  ): Promise<PluginInstance> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    const updatedParams = { ...instance.parameters, ...parameters };
    
    await db.update(pluginInstances)
      .set({ 
        params: updatedParams, 
        updatedAt: new Date() 
      })
      .where(eq(pluginInstances.id, instanceId));

    instance.parameters = updatedParams;
    instance.updatedAt = new Date();
    this.instanceCache.set(instanceId, instance);

    return instance;
  }

  async setInstanceBypassed(instanceId: string, bypassed: boolean): Promise<void> {
    await db.update(pluginInstances)
      .set({ bypassed, updatedAt: new Date() })
      .where(eq(pluginInstances.id, instanceId));

    const cached = this.instanceCache.get(instanceId);
    if (cached) {
      cached.bypassed = bypassed;
    }
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await db.delete(pluginInstances)
      .where(eq(pluginInstances.id, instanceId));

    this.instanceCache.delete(instanceId);
    this.sandboxContexts.delete(instanceId);
  }

  async getProjectInstances(projectId: string): Promise<PluginInstance[]> {
    const instances = await db.query.pluginInstances.findMany({
      where: eq(pluginInstances.projectId, projectId),
    });

    const result: PluginInstance[] = [];
    for (const instance of instances) {
      const catalog = await db.query.pluginCatalog.findFirst({
        where: eq(pluginCatalog.id, instance.catalogId),
      });

      result.push({
        id: instance.id,
        pluginId: catalog?.slug || instance.catalogId,
        projectId: instance.projectId,
        trackId: instance.trackId || undefined,
        chainPosition: instance.index,
        parameters: (instance.params as Record<string, number | boolean | string>) || {},
        bypassed: instance.bypassed || false,
        createdAt: instance.createdAt || new Date(),
        updatedAt: instance.updatedAt || new Date(),
      });
    }

    return result;
  }

  async getTrackInstances(trackId: string): Promise<PluginInstance[]> {
    const instances = await db.query.pluginInstances.findMany({
      where: eq(pluginInstances.trackId, trackId),
    });

    const result: PluginInstance[] = [];
    for (const instance of instances) {
      const catalog = await db.query.pluginCatalog.findFirst({
        where: eq(pluginCatalog.id, instance.catalogId),
      });

      result.push({
        id: instance.id,
        pluginId: catalog?.slug || instance.catalogId,
        projectId: instance.projectId,
        trackId: instance.trackId || undefined,
        chainPosition: instance.index,
        parameters: (instance.params as Record<string, number | boolean | string>) || {},
        bypassed: instance.bypassed || false,
        createdAt: instance.createdAt || new Date(),
        updatedAt: instance.updatedAt || new Date(),
      });
    }

    return result.sort((a, b) => a.chainPosition - b.chainPosition);
  }

  private initializeSandbox(instanceId: string): void {
    const context: RenderContext = {
      sampleRate: 48000,
      blockSize: 512,
      currentTime: 0,
      tempo: 120,
    };
    this.sandboxContexts.set(instanceId, context);
  }

  async renderInstrument(
    instanceId: string,
    notes: Array<{ note: number; velocity: number; duration: number; startTime: number }>,
    durationSec: number,
    sampleRate: number = 48000
  ): Promise<{ samples: number[][]; sampleRate: number }> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    const plugin = this.getPluginById(instance.pluginId);
    if (!plugin || plugin.category !== 'instrument') {
      throw new Error('Invalid instrument plugin');
    }

    const numSamples = Math.ceil(durationSec * sampleRate);
    const leftChannel = new Float32Array(numSamples);
    const rightChannel = new Float32Array(numSamples);

    for (const note of notes) {
      this.synthesizeNote(
        leftChannel,
        rightChannel,
        note,
        plugin,
        instance.parameters,
        sampleRate
      );
    }

    const volume = (instance.parameters.volume as number) || 0.8;
    for (let i = 0; i < numSamples; i++) {
      leftChannel[i] *= volume;
      rightChannel[i] *= volume;
    }

    return {
      samples: [Array.from(leftChannel), Array.from(rightChannel)],
      sampleRate,
    };
  }

  private synthesizeNote(
    left: Float32Array,
    right: Float32Array,
    note: { note: number; velocity: number; duration: number; startTime: number },
    plugin: PluginDefinition,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const frequency = 440 * Math.pow(2, (note.note - 69) / 12);
    const startSample = Math.floor(note.startTime * sampleRate);
    const envelope = plugin.envelope || { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 };
    
    const attackSamples = Math.floor((params.attack as number || envelope.attack) * sampleRate);
    const decaySamples = Math.floor(envelope.decay * sampleRate);
    const releaseSamples = Math.floor((params.release as number || envelope.release) * sampleRate);
    const noteDurationSamples = Math.floor(note.duration * sampleRate);
    const totalSamples = noteDurationSamples + releaseSamples;
    
    const velocityGain = note.velocity / 127;

    for (let i = 0; i < totalSamples && startSample + i < left.length; i++) {
      let envValue = 1;
      if (i < attackSamples) {
        envValue = i / attackSamples;
      } else if (i < attackSamples + decaySamples) {
        const decayProgress = (i - attackSamples) / decaySamples;
        envValue = 1 - decayProgress * (1 - envelope.sustain);
      } else if (i < noteDurationSamples) {
        envValue = envelope.sustain;
      } else {
        const releaseProgress = (i - noteDurationSamples) / releaseSamples;
        envValue = envelope.sustain * (1 - releaseProgress);
      }

      let sample = 0;
      const oscillators = plugin.oscillators || [{ type: 'sine' as const, detune: 0, gain: 1 }];
      
      for (const osc of oscillators) {
        const detunedFreq = frequency * Math.pow(2, osc.detune / 1200);
        const phase = (2 * Math.PI * detunedFreq * (startSample + i)) / sampleRate;
        
        let oscSample = 0;
        switch (osc.type) {
          case 'sine':
            oscSample = Math.sin(phase);
            break;
          case 'square':
            oscSample = Math.sign(Math.sin(phase));
            break;
          case 'sawtooth':
            oscSample = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
            break;
          case 'triangle':
            oscSample = 2 * Math.abs(2 * ((phase / (2 * Math.PI)) % 1) - 1) - 1;
            break;
          case 'noise':
            oscSample = Math.random() * 2 - 1;
            break;
        }
        sample += oscSample * osc.gain;
      }

      const finalSample = sample * envValue * velocityGain * 0.3;
      const idx = startSample + i;
      if (idx >= 0 && idx < left.length) {
        left[idx] += finalSample;
        right[idx] += finalSample;
      }
    }
  }

  private readonly PLUGIN_PROCESSING_TIMEOUT_MS = 30000;
  private readonly MAX_AUDIO_BUFFER_SIZE = 10 * 1024 * 1024;

  private async withPluginTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    pluginId: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Plugin ${pluginId} processing timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  private validateBufferSize(samples: number[][] | Float32Array[]): void {
    const totalSize = samples.reduce((sum, channel) => sum + channel.length * 4, 0);
    if (totalSize > this.MAX_AUDIO_BUFFER_SIZE) {
      throw new Error(`Audio buffer exceeds maximum allowed size (${this.MAX_AUDIO_BUFFER_SIZE} bytes)`);
    }
  }

  async processEffect(
    instanceId: string,
    inputBuffer: { samples: number[][]; sampleRate: number }
  ): Promise<{ samples: number[][]; sampleRate: number }> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    if (instance.bypassed) {
      return inputBuffer;
    }

    const plugin = this.getPluginById(instance.pluginId);
    if (!plugin || plugin.category !== 'effect') {
      throw new Error('Invalid effect plugin');
    }

    this.validateBufferSize(inputBuffer.samples);

    const processInternal = async (): Promise<{ samples: number[][]; sampleRate: number }> => {
      const left = new Float32Array(inputBuffer.samples[0]);
      const right = new Float32Array(inputBuffer.samples[1] || inputBuffer.samples[0]);
      const params = instance.parameters;

      try {
        const processor = getEffectProcessor(instance.pluginId);
        if (processor) {
          const result = processor.process(
            { samples: [left, right], sampleRate: inputBuffer.sampleRate, channels: 2 },
            params,
            { sampleRate: inputBuffer.sampleRate, tempo: 120 }
          );
          return {
            samples: [Array.from(result.samples[0]), Array.from(result.samples[1])],
            sampleRate: result.sampleRate,
          };
        }

        switch (plugin.type) {
          case 'reverb':
            this.applyReverb(left, right, params, inputBuffer.sampleRate);
            break;
          case 'delay':
            this.applyDelay(left, right, params, inputBuffer.sampleRate);
            break;
          case 'chorus':
            this.applyChorus(left, right, params, inputBuffer.sampleRate);
            break;
          case 'compressor':
            this.applyCompressor(left, right, params, inputBuffer.sampleRate);
            break;
          case 'eq':
            this.applyEQ(left, right, params, inputBuffer.sampleRate);
            break;
          case 'limiter':
            this.applyLimiter(left, right, params, inputBuffer.sampleRate);
            break;
          case 'gate':
            this.applyGate(left, right, params, inputBuffer.sampleRate);
            break;
          case 'distortion':
            this.applyDistortion(left, right, params, inputBuffer.sampleRate);
            break;
          case 'phaser':
            this.applyPhaser(left, right, params, inputBuffer.sampleRate);
            break;
          case 'flanger':
            this.applyFlanger(left, right, params, inputBuffer.sampleRate);
            break;
        }

        return {
          samples: [Array.from(left), Array.from(right)],
          sampleRate: inputBuffer.sampleRate,
        };
      } catch (error: unknown) {
        logger.error(`Plugin ${instance.pluginId} processing error:`, error);
        return inputBuffer;
      }
    };

    return this.withPluginTimeout(
      processInternal(),
      this.PLUGIN_PROCESSING_TIMEOUT_MS,
      instance.pluginId
    );
  }

  async processEffectAdvanced(
    pluginId: string,
    inputBuffer: { samples: Float32Array[]; sampleRate: number; channels: number },
    params: Record<string, number | boolean | string>,
    context: { sampleRate: number; tempo: number }
  ): Promise<{ samples: Float32Array[]; sampleRate: number; channels: number }> {
    const processor = getEffectProcessor(pluginId);
    if (!processor) {
      throw new Error(`No advanced DSP processor found for plugin: ${pluginId}`);
    }
    return processor.process(inputBuffer, params, context);
  }

  async renderInstrumentAdvanced(
    pluginId: string,
    notes: Array<{ frequency: number; velocity: number; durationMs: number }>,
    context: { sampleRate: number; tempo: number }
  ): Promise<{ samples: Float32Array[]; sampleRate: number; channels: number }> {
    const synth = getInstrumentSynthesizer(pluginId);
    if (!synth) {
      throw new Error(`No synthesizer found for plugin: ${pluginId}`);
    }
    
    const totalDuration = notes.reduce((max, n) => Math.max(max, n.durationMs), 0) + 1000;
    const numSamples = Math.ceil(totalDuration / 1000 * context.sampleRate);
    const output: Float32Array[] = [new Float32Array(numSamples), new Float32Array(numSamples)];
    
    for (const note of notes) {
      synth.noteOn(note.frequency, note.velocity, context);
      const noteSamples = Math.ceil(note.durationMs / 1000 * context.sampleRate);
      const rendered = synth.render(noteSamples, context);
      
      for (let i = 0; i < rendered.samples[0].length && i < output[0].length; i++) {
        output[0][i] += rendered.samples[0][i];
        output[1][i] += rendered.samples[1][i];
      }
      
      synth.noteOff({ sampleRate: context.sampleRate });
      synth.reset();
    }
    
    return { samples: output, sampleRate: context.sampleRate, channels: 2 };
  }

  getDSPProcessorInfo(): ReturnType<typeof getProcessorInfo> {
    return getProcessorInfo();
  }

  private applyReverb(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mix = (params.mix as number) || 0.3;
    const decay = (params.decay as number) || 2.0;
    const roomSize = (params.roomSize as number) || 0.5;
    const damping = (params.damping as number) || 0.5;
    
    const delayLength = Math.floor(roomSize * 0.1 * sampleRate);
    const delayBuffer = new Float32Array(delayLength);
    let delayIndex = 0;
    
    for (let i = 0; i < left.length; i++) {
      const dryL = left[i];
      const dryR = right[i];
      
      const delayed = delayBuffer[delayIndex];
      const wetSample = delayed * decay * (1 - damping);
      
      delayBuffer[delayIndex] = (dryL + dryR) * 0.5 + wetSample * 0.5;
      delayIndex = (delayIndex + 1) % delayLength;
      
      left[i] = dryL * (1 - mix) + wetSample * mix;
      right[i] = dryR * (1 - mix) + wetSample * mix;
    }
  }

  private applyDelay(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mix = (params.mix as number) || 0.3;
    const feedback = (params.feedback as number) || 0.4;
    const timeLeft = ((params.timeLeft as number) || 250) / 1000;
    const timeRight = ((params.timeRight as number) || 375) / 1000;
    
    const delaySamplesL = Math.floor(timeLeft * sampleRate);
    const delaySamplesR = Math.floor(timeRight * sampleRate);
    
    const delayBufferL = new Float32Array(delaySamplesL || 1);
    const delayBufferR = new Float32Array(delaySamplesR || 1);
    let indexL = 0, indexR = 0;
    
    for (let i = 0; i < left.length; i++) {
      const dryL = left[i];
      const dryR = right[i];
      
      const delayedL = delayBufferL[indexL];
      const delayedR = delayBufferR[indexR];
      
      delayBufferL[indexL] = dryL + delayedL * feedback;
      delayBufferR[indexR] = dryR + delayedR * feedback;
      
      indexL = (indexL + 1) % delayBufferL.length;
      indexR = (indexR + 1) % delayBufferR.length;
      
      left[i] = dryL * (1 - mix) + delayedL * mix;
      right[i] = dryR * (1 - mix) + delayedR * mix;
    }
  }

  private applyChorus(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mix = (params.mix as number) || 0.5;
    const rate = (params.rate as number) || 1.0;
    const depth = (params.depth as number) || 0.5;
    const baseDelay = ((params.delay as number) || 7) / 1000;
    
    const maxDelaySamples = Math.floor((baseDelay + 0.01) * sampleRate);
    const delayBufferL = new Float32Array(maxDelaySamples);
    const delayBufferR = new Float32Array(maxDelaySamples);
    let writeIndex = 0;
    
    for (let i = 0; i < left.length; i++) {
      const lfo = Math.sin(2 * Math.PI * rate * i / sampleRate) * depth * 0.5 + 0.5;
      const delaySamples = Math.floor((baseDelay * lfo + 0.001) * sampleRate);
      const readIndex = (writeIndex - delaySamples + maxDelaySamples) % maxDelaySamples;
      
      const dryL = left[i];
      const dryR = right[i];
      
      const chorusL = delayBufferL[readIndex];
      const chorusR = delayBufferR[readIndex];
      
      delayBufferL[writeIndex] = dryL;
      delayBufferR[writeIndex] = dryR;
      writeIndex = (writeIndex + 1) % maxDelaySamples;
      
      left[i] = dryL * (1 - mix) + chorusL * mix;
      right[i] = dryR * (1 - mix) + chorusR * mix;
    }
  }

  private applyCompressor(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const threshold = (params.threshold as number) || -20;
    const ratio = (params.ratio as number) || 4;
    const attackMs = (params.attack as number) || 10;
    const releaseMs = (params.release as number) || 100;
    const makeupGain = (params.makeupGain as number) || 0;
    const mix = (params.mix as number) || 1.0;
    
    const attackCoeff = Math.exp(-1 / (attackMs / 1000 * sampleRate));
    const releaseCoeff = Math.exp(-1 / (releaseMs / 1000 * sampleRate));
    
    let envelope = 0;
    const thresholdLin = Math.pow(10, threshold / 20);
    const makeupLin = Math.pow(10, makeupGain / 20);
    
    for (let i = 0; i < left.length; i++) {
      const inputLevel = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      
      const coeff = inputLevel > envelope ? attackCoeff : releaseCoeff;
      envelope = envelope * coeff + inputLevel * (1 - coeff);
      
      let gain = 1;
      if (envelope > thresholdLin) {
        const overDb = 20 * Math.log10(envelope / thresholdLin);
        const reducedDb = overDb * (1 - 1 / ratio);
        gain = Math.pow(10, -reducedDb / 20);
      }
      
      const processedL = left[i] * gain * makeupLin;
      const processedR = right[i] * gain * makeupLin;
      
      left[i] = left[i] * (1 - mix) + processedL * mix;
      right[i] = right[i] * (1 - mix) + processedR * mix;
    }
  }

  private applyEQ(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const outputGain = Math.pow(10, ((params.outputGain as number) || 0) / 20);
    
    for (let i = 0; i < left.length; i++) {
      left[i] *= outputGain;
      right[i] *= outputGain;
    }
  }

  private applyLimiter(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const ceiling = Math.pow(10, ((params.ceiling as number) || -0.3) / 20);
    const threshold = Math.pow(10, ((params.threshold as number) || -6) / 20);
    
    for (let i = 0; i < left.length; i++) {
      const maxLevel = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      
      if (maxLevel > threshold) {
        const gain = ceiling / maxLevel;
        left[i] *= gain;
        right[i] *= gain;
      }
      
      left[i] = Math.max(-ceiling, Math.min(ceiling, left[i]));
      right[i] = Math.max(-ceiling, Math.min(ceiling, right[i]));
    }
  }

  private applyGate(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const threshold = Math.pow(10, ((params.threshold as number) || -40) / 20);
    const range = Math.pow(10, ((params.range as number) || -80) / 20);
    const attackMs = (params.attack as number) || 1;
    const holdMs = (params.hold as number) || 50;
    const releaseMs = (params.release as number) || 100;
    
    const attackSamples = Math.floor(attackMs / 1000 * sampleRate);
    const holdSamples = Math.floor(holdMs / 1000 * sampleRate);
    const releaseSamples = Math.floor(releaseMs / 1000 * sampleRate);
    
    let gateGain = 0;
    let holdCounter = 0;
    let state: 'closed' | 'attack' | 'open' | 'hold' | 'release' = 'closed';
    let stateCounter = 0;
    
    for (let i = 0; i < left.length; i++) {
      const level = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      
      if (level > threshold) {
        if (state === 'closed' || state === 'release') {
          state = 'attack';
          stateCounter = 0;
        } else if (state === 'attack' || state === 'open') {
          holdCounter = holdSamples;
        }
      } else {
        if (state === 'open') {
          if (holdCounter > 0) {
            holdCounter--;
            state = 'hold';
          } else {
            state = 'release';
            stateCounter = 0;
          }
        } else if (state === 'hold') {
          if (holdCounter > 0) {
            holdCounter--;
          } else {
            state = 'release';
            stateCounter = 0;
          }
        }
      }
      
      switch (state) {
        case 'attack':
          stateCounter++;
          gateGain = Math.min(1, stateCounter / attackSamples);
          if (stateCounter >= attackSamples) {
            state = 'open';
            holdCounter = holdSamples;
          }
          break;
        case 'open':
        case 'hold':
          gateGain = 1;
          break;
        case 'release':
          stateCounter++;
          gateGain = Math.max(range, 1 - stateCounter / releaseSamples);
          if (stateCounter >= releaseSamples) {
            state = 'closed';
            gateGain = range;
          }
          break;
        case 'closed':
          gateGain = range;
          break;
      }
      
      left[i] *= gateGain;
      right[i] *= gateGain;
    }
  }

  private applyDistortion(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mode = (params.mode as string) || 'tube';
    const drive = (params.drive as number) || 0.5;
    const tone = (params.tone as number) || 0.5;
    const outputGain = Math.pow(10, ((params.output as number) || 0) / 20);
    const mix = (params.mix as number) || 1.0;
    const bias = (params.bias as number) || 0;
    
    const driveAmount = 1 + drive * 20;
    
    for (let i = 0; i < left.length; i++) {
      const dryL = left[i];
      const dryR = right[i];
      
      let wetL = dryL * driveAmount + bias;
      let wetR = dryR * driveAmount + bias;
      
      switch (mode) {
        case 'tube':
          wetL = Math.tanh(wetL);
          wetR = Math.tanh(wetR);
          break;
        case 'tape':
          wetL = wetL / (1 + Math.abs(wetL)) * 1.2;
          wetR = wetR / (1 + Math.abs(wetR)) * 1.2;
          break;
        case 'transistor':
          wetL = Math.sign(wetL) * Math.pow(Math.abs(wetL), 0.7);
          wetR = Math.sign(wetR) * Math.pow(Math.abs(wetR), 0.7);
          break;
        case 'fuzz':
          wetL = Math.sign(wetL) * (1 - Math.exp(-Math.abs(wetL * 3)));
          wetR = Math.sign(wetR) * (1 - Math.exp(-Math.abs(wetR * 3)));
          break;
        case 'bitcrush':
          const bits = Math.floor(4 + (1 - drive) * 12);
          const levels = Math.pow(2, bits);
          wetL = Math.round(wetL * levels) / levels;
          wetR = Math.round(wetR * levels) / levels;
          break;
      }
      
      if (tone !== 0.5) {
        const toneAlpha = 1 - Math.abs(tone - 0.5) * 0.3;
        wetL = wetL * toneAlpha + wetL * (1 - toneAlpha) * (tone > 0.5 ? 1.2 : 0.8);
        wetR = wetR * toneAlpha + wetR * (1 - toneAlpha) * (tone > 0.5 ? 1.2 : 0.8);
      }
      
      wetL *= outputGain;
      wetR *= outputGain;
      
      left[i] = dryL * (1 - mix) + wetL * mix;
      right[i] = dryR * (1 - mix) + wetR * mix;
    }
  }

  private applyPhaser(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const rate = (params.rate as number) || 0.5;
    const depth = (params.depth as number) || 0.7;
    const feedback = (params.feedback as number) || 0.5;
    const stages = (params.stages as number) || 4;
    const centerFreq = (params.centerFreq as number) || 1000;
    const spread = (params.spread as number) || 0.5;
    const mix = (params.mix as number) || 0.5;
    
    const allpassStatesL: number[][] = Array(stages).fill(null).map(() => [0, 0]);
    const allpassStatesR: number[][] = Array(stages).fill(null).map(() => [0, 0]);
    let feedbackL = 0;
    let feedbackR = 0;
    
    for (let i = 0; i < left.length; i++) {
      const lfoPhaseL = 2 * Math.PI * rate * i / sampleRate;
      const lfoPhaseR = lfoPhaseL + spread * Math.PI;
      
      const lfoL = (Math.sin(lfoPhaseL) + 1) * 0.5;
      const lfoR = (Math.sin(lfoPhaseR) + 1) * 0.5;
      
      const minFreq = centerFreq * 0.5;
      const maxFreq = centerFreq * 2;
      const freqL = minFreq + (maxFreq - minFreq) * lfoL * depth;
      const freqR = minFreq + (maxFreq - minFreq) * lfoR * depth;
      
      let inputL = left[i] + feedbackL * feedback;
      let inputR = right[i] + feedbackR * feedback;
      
      for (let s = 0; s < stages; s++) {
        const stageFreqL = freqL * (1 + s * 0.3);
        const stageFreqR = freqR * (1 + s * 0.3);
        
        const coeffL = (stageFreqL - sampleRate) / (stageFreqL + sampleRate);
        const coeffR = (stageFreqR - sampleRate) / (stageFreqR + sampleRate);
        
        const tempL = inputL;
        const tempR = inputR;
        
        inputL = allpassStatesL[s][0] + tempL * coeffL;
        allpassStatesL[s][0] = tempL - inputL * coeffL;
        
        inputR = allpassStatesR[s][0] + tempR * coeffR;
        allpassStatesR[s][0] = tempR - inputR * coeffR;
      }
      
      feedbackL = inputL;
      feedbackR = inputR;
      
      left[i] = left[i] * (1 - mix) + (left[i] + inputL) * 0.5 * mix;
      right[i] = right[i] * (1 - mix) + (right[i] + inputR) * 0.5 * mix;
    }
  }

  private applyFlanger(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const rate = (params.rate as number) || 0.3;
    const depth = (params.depth as number) || 0.6;
    const baseDelay = ((params.delay as number) || 5) / 1000;
    const feedback = (params.feedback as number) || 0.5;
    const mix = (params.mix as number) || 0.5;
    const stereoPhase = (params.stereoPhase as number) || 0.25;
    const manualMode = (params.manualMode as boolean) || false;
    const manualDelay = ((params.manualDelay as number) || 5) / 1000;
    
    const maxDelaySamples = Math.floor(0.025 * sampleRate);
    const delayBufferL = new Float32Array(maxDelaySamples);
    const delayBufferR = new Float32Array(maxDelaySamples);
    let writeIndex = 0;
    let feedbackSampleL = 0;
    let feedbackSampleR = 0;
    
    for (let i = 0; i < left.length; i++) {
      let delayTimeL: number, delayTimeR: number;
      
      if (manualMode) {
        delayTimeL = manualDelay;
        delayTimeR = manualDelay;
      } else {
        const lfoPhaseL = 2 * Math.PI * rate * i / sampleRate;
        const lfoPhaseR = lfoPhaseL + stereoPhase * 2 * Math.PI;
        
        const lfoL = (Math.sin(lfoPhaseL) + 1) * 0.5;
        const lfoR = (Math.sin(lfoPhaseR) + 1) * 0.5;
        
        const minDelay = baseDelay * 0.1;
        const maxDelay = baseDelay;
        delayTimeL = minDelay + (maxDelay - minDelay) * lfoL * depth;
        delayTimeR = minDelay + (maxDelay - minDelay) * lfoR * depth;
      }
      
      const delaySamplesL = Math.min(delayTimeL * sampleRate, maxDelaySamples - 1);
      const delaySamplesR = Math.min(delayTimeR * sampleRate, maxDelaySamples - 1);
      
      const readIndexL = (writeIndex - Math.floor(delaySamplesL) + maxDelaySamples) % maxDelaySamples;
      const readIndexR = (writeIndex - Math.floor(delaySamplesR) + maxDelaySamples) % maxDelaySamples;
      
      const delayedL = delayBufferL[readIndexL];
      const delayedR = delayBufferR[readIndexR];
      
      delayBufferL[writeIndex] = left[i] + delayedL * feedback;
      delayBufferR[writeIndex] = right[i] + delayedR * feedback;
      
      feedbackSampleL = delayedL;
      feedbackSampleR = delayedR;
      
      writeIndex = (writeIndex + 1) % maxDelaySamples;
      
      const wetL = (left[i] + delayedL) * 0.5;
      const wetR = (right[i] + delayedR) * 0.5;
      
      left[i] = left[i] * (1 - mix) + wetL * mix;
      right[i] = right[i] * (1 - mix) + wetR * mix;
    }
  }

  async savePreset(
    userId: string,
    pluginId: string,
    name: string,
    parameters: Record<string, number | boolean | string>,
    options: { category?: string; isPublic?: boolean } = {}
  ): Promise<PluginPreset> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const [preset] = await db.insert(pluginPresets).values({
      userId,
      presetName: name,
      pluginType: plugin.type,
      pluginId: plugin.id,
      parameters,
      category: options.category || null,
      isDefault: false,
      isPublic: options.isPublic || false,
    }).returning();

    return {
      id: preset.id,
      userId: preset.userId,
      pluginId: preset.pluginId || plugin.id,
      name: preset.presetName,
      category: preset.category || undefined,
      parameters: preset.parameters as Record<string, number | boolean | string>,
      isDefault: preset.isDefault || false,
      isPublic: preset.isPublic || false,
      createdAt: preset.createdAt,
    };
  }

  async getPresets(
    pluginId: string,
    userId: string,
    options: { includePublic?: boolean; category?: string } = {}
  ): Promise<PluginPreset[]> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const conditions = [eq(pluginPresets.pluginType, plugin.type)];
    
    if (options.includePublic) {
      conditions.push(
        and(
          eq(pluginPresets.userId, userId),
          eq(pluginPresets.isPublic, true)
        ) as any
      );
    } else {
      conditions.push(eq(pluginPresets.userId, userId));
    }

    if (options.category) {
      conditions.push(eq(pluginPresets.category, options.category));
    }

    const presets = await db.query.pluginPresets.findMany({
      where: and(...conditions),
      orderBy: [desc(pluginPresets.createdAt)],
    });

    return presets.map(p => ({
      id: p.id,
      userId: p.userId,
      pluginId: p.pluginId || pluginId,
      name: p.presetName,
      category: p.category || undefined,
      parameters: p.parameters as Record<string, number | boolean | string>,
      isDefault: p.isDefault || false,
      isPublic: p.isPublic || false,
      createdAt: p.createdAt,
    }));
  }

  async loadPreset(presetId: string): Promise<PluginPreset | undefined> {
    const preset = await db.query.pluginPresets.findFirst({
      where: eq(pluginPresets.id, presetId),
    });

    if (!preset) {
      return undefined;
    }

    return {
      id: preset.id,
      userId: preset.userId,
      pluginId: preset.pluginId || '',
      name: preset.presetName,
      category: preset.category || undefined,
      parameters: preset.parameters as Record<string, number | boolean | string>,
      isDefault: preset.isDefault || false,
      isPublic: preset.isPublic || false,
      createdAt: preset.createdAt,
    };
  }

  async deletePreset(presetId: string, userId: string): Promise<void> {
    await db.delete(pluginPresets)
      .where(and(
        eq(pluginPresets.id, presetId),
        eq(pluginPresets.userId, userId)
      ));
  }

  async applyPresetToInstance(instanceId: string, presetId: string): Promise<PluginInstance> {
    const preset = await this.loadPreset(presetId);
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    return this.updateInstanceParameters(instanceId, preset.parameters);
  }

  getFactoryPresets(pluginId: string): Array<{ name: string; parameters: Record<string, number | boolean | string> }> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      return [];
    }

    const presets = [{ name: 'Default', parameters: plugin.defaultPreset }];

    if (plugin.type === 'reverb') {
      presets.push(
        { name: 'Small Room', parameters: { ...plugin.defaultPreset, roomSize: 0.2, decay: 0.8, damping: 0.7 } },
        { name: 'Large Hall', parameters: { ...plugin.defaultPreset, roomSize: 0.9, decay: 4.0, damping: 0.3 } },
        { name: 'Plate', parameters: { ...plugin.defaultPreset, roomSize: 0.6, decay: 2.5, diffusion: 0.95, damping: 0.4 } }
      );
    } else if (plugin.type === 'compressor') {
      presets.push(
        { name: 'Vocal', parameters: { ...plugin.defaultPreset, threshold: -18, ratio: 3, attack: 15, release: 80 } },
        { name: 'Drums', parameters: { ...plugin.defaultPreset, threshold: -12, ratio: 6, attack: 5, release: 50 } },
        { name: 'Master Bus', parameters: { ...plugin.defaultPreset, threshold: -10, ratio: 2, attack: 30, release: 200 } }
      );
    } else if (plugin.type === 'eq') {
      presets.push(
        { name: 'Bright', parameters: { ...plugin.defaultPreset, highGain: 3, midGain: 1 } },
        { name: 'Warm', parameters: { ...plugin.defaultPreset, lowGain: 2, highGain: -2 } },
        { name: 'Presence', parameters: { ...plugin.defaultPreset, midFreq: 3000, midGain: 4, midQ: 1.5 } }
      );
    } else if (plugin.type === 'analog') {
      presets.push(
        { name: 'Classic Lead', parameters: { ...plugin.defaultPreset, osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 12, filterCutoff: 3000, filterResonance: 0.5, attack: 0.01, release: 0.2 } },
        { name: 'Fat Bass', parameters: { ...plugin.defaultPreset, osc1Wave: 'square', osc2Wave: 'sawtooth', oscMix: 0.7, filterCutoff: 800, filterResonance: 0.6, attack: 0.001, decay: 0.2, sustain: 0.8 } },
        { name: 'Pad Atmosphere', parameters: { ...plugin.defaultPreset, osc1Wave: 'triangle', osc2Wave: 'sine', filterCutoff: 2000, lfoRate: 0.3, lfoDepth: 0.4, attack: 1.0, release: 2.0 } },
        { name: 'Pluck', parameters: { ...plugin.defaultPreset, osc1Wave: 'square', filterCutoff: 8000, filterEnvAmount: 0.8, attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.1 } }
      );
    } else if (plugin.type === 'fm') {
      presets.push(
        { name: 'Electric Piano', parameters: { ...plugin.defaultPreset, algorithm: 1, op1Ratio: 1, op2Ratio: 14, op2Level: 0.3, modIndex: 1.5, attack: 0.001, decay: 0.8, sustain: 0.2 } },
        { name: 'FM Bass', parameters: { ...plugin.defaultPreset, algorithm: 1, op1Ratio: 1, op2Ratio: 1, op2Level: 0.8, modIndex: 3.0, attack: 0.001, decay: 0.3, sustain: 0.5 } },
        { name: 'Bell', parameters: { ...plugin.defaultPreset, algorithm: 2, op1Ratio: 1, op2Ratio: 3.5, op2Level: 0.6, modIndex: 4.0, attack: 0.001, decay: 2.0, sustain: 0 } },
        { name: 'Metallic', parameters: { ...plugin.defaultPreset, algorithm: 3, op1Ratio: 1, op2Ratio: 7, op3Ratio: 11, modIndex: 5.0, feedback: 0.3 } },
        { name: 'Organ', parameters: { ...plugin.defaultPreset, algorithm: 4, op1Ratio: 0.5, op2Ratio: 1, op3Ratio: 2, op4Ratio: 4, modIndex: 0.5, sustain: 1.0, release: 0.1 } }
      );
    } else if (plugin.type === 'wavetable') {
      presets.push(
        { name: 'Digital Pad', parameters: { ...plugin.defaultPreset, wavetable: 'digital', wavePosition: 0.5, unison: 4, unisonDetune: 20, attack: 0.5, release: 1.5 } },
        { name: 'Vocal Lead', parameters: { ...plugin.defaultPreset, wavetable: 'vocal', wavePosition: 0.3, morphSpeed: 0.5, filterCutoff: 5000 } },
        { name: 'Harsh Bass', parameters: { ...plugin.defaultPreset, wavetable: 'metallic', wavePosition: 0.7, unison: 2, filterCutoff: 2000, attack: 0.001 } },
        { name: 'Evolving Texture', parameters: { ...plugin.defaultPreset, wavetable: 'chaos', morphSpeed: 0.2, lfoToPosition: 0.8, lfoRate: 0.1, attack: 2.0 } }
      );
    } else if (plugin.type === 'sampler') {
      presets.push(
        { name: 'Piano Natural', parameters: { ...plugin.defaultPreset, sampleBank: 'piano', velocitySensitivity: 1.0, attack: 0.001, release: 0.5 } },
        { name: 'Strings Legato', parameters: { ...plugin.defaultPreset, sampleBank: 'strings', loopEnabled: true, attack: 0.3, release: 0.8 } },
        { name: 'Brass Stab', parameters: { ...plugin.defaultPreset, sampleBank: 'brass', attack: 0.05, decay: 0.3, sustain: 0.7 } },
        { name: 'Choir Pad', parameters: { ...plugin.defaultPreset, sampleBank: 'choir', loopEnabled: true, attack: 0.8, release: 1.5 } },
        { name: 'Percussion Kit', parameters: { ...plugin.defaultPreset, sampleBank: 'percussion', playbackMode: 'oneshot', velocitySensitivity: 0.9 } }
      );
    } else if (plugin.type === 'distortion') {
      presets.push(
        { name: 'Warm Tube', parameters: { ...plugin.defaultPreset, mode: 'tube', drive: 0.3, tone: 0.6, mix: 0.7 } },
        { name: 'Tape Saturation', parameters: { ...plugin.defaultPreset, mode: 'tape', drive: 0.4, tone: 0.5, mix: 0.5 } },
        { name: 'Aggressive Fuzz', parameters: { ...plugin.defaultPreset, mode: 'fuzz', drive: 0.8, tone: 0.4, output: -6 } },
        { name: 'Lo-Fi Crush', parameters: { ...plugin.defaultPreset, mode: 'bitcrush', drive: 0.7, tone: 0.3, mix: 0.8 } },
        { name: 'Transistor Grit', parameters: { ...plugin.defaultPreset, mode: 'transistor', drive: 0.5, tone: 0.55, bias: 0.1 } }
      );
    } else if (plugin.type === 'phaser') {
      presets.push(
        { name: 'Classic Sweep', parameters: { ...plugin.defaultPreset, rate: 0.3, depth: 0.8, feedback: 0.6, stages: 4 } },
        { name: 'Deep Space', parameters: { ...plugin.defaultPreset, rate: 0.1, depth: 1.0, feedback: 0.8, stages: 8, spread: 0.7 } },
        { name: 'Subtle Motion', parameters: { ...plugin.defaultPreset, rate: 0.5, depth: 0.3, feedback: 0.2, stages: 2, mix: 0.3 } },
        { name: 'Jet Engine', parameters: { ...plugin.defaultPreset, rate: 2.0, depth: 0.9, feedback: 0.7, stages: 6 } }
      );
    } else if (plugin.type === 'flanger') {
      presets.push(
        { name: 'Classic Jet', parameters: { ...plugin.defaultPreset, rate: 0.2, depth: 0.7, delay: 4, feedback: 0.6 } },
        { name: 'Metallic Sweep', parameters: { ...plugin.defaultPreset, rate: 0.5, depth: 0.9, delay: 2, feedback: 0.8 } },
        { name: 'Subtle Width', parameters: { ...plugin.defaultPreset, rate: 0.1, depth: 0.3, feedback: 0.2, stereoPhase: 0.5, mix: 0.3 } },
        { name: 'Through Zero', parameters: { ...plugin.defaultPreset, throughZero: true, rate: 0.15, depth: 1.0, feedback: 0.4 } },
        { name: 'Negative Feedback', parameters: { ...plugin.defaultPreset, rate: 0.3, depth: 0.6, feedback: -0.7 } }
      );
    } else if (plugin.type === 'delay') {
      presets.push(
        { name: 'Slapback', parameters: { ...plugin.defaultPreset, timeLeft: 100, timeRight: 100, feedback: 0.1, mix: 0.4 } },
        { name: 'Ping Pong', parameters: { ...plugin.defaultPreset, timeLeft: 250, timeRight: 500, feedback: 0.5, mix: 0.35 } },
        { name: 'Long Ambient', parameters: { ...plugin.defaultPreset, timeLeft: 500, timeRight: 750, feedback: 0.6, mix: 0.3, damping: 0.5 } }
      );
    } else if (plugin.type === 'chorus') {
      presets.push(
        { name: 'Light Shimmer', parameters: { ...plugin.defaultPreset, rate: 1.5, depth: 0.3, mix: 0.3 } },
        { name: 'Rich Ensemble', parameters: { ...plugin.defaultPreset, rate: 0.8, depth: 0.7, voices: 4, mix: 0.5 } },
        { name: 'Vintage', parameters: { ...plugin.defaultPreset, rate: 0.5, depth: 0.5, delay: 10, mix: 0.4 } }
      );
    } else if (plugin.type === 'gate') {
      presets.push(
        { name: 'Tight Drums', parameters: { ...plugin.defaultPreset, threshold: -30, attack: 0.5, hold: 20, release: 50 } },
        { name: 'Vocal DeNoise', parameters: { ...plugin.defaultPreset, threshold: -45, attack: 2, hold: 100, release: 150 } },
        { name: 'Creative Chop', parameters: { ...plugin.defaultPreset, threshold: -20, attack: 0.1, hold: 10, release: 20, range: -60 } }
      );
    } else if (plugin.type === 'limiter') {
      presets.push(
        { name: 'Transparent Master', parameters: { ...plugin.defaultPreset, ceiling: -0.1, threshold: -3, release: 150 } },
        { name: 'Loud Master', parameters: { ...plugin.defaultPreset, ceiling: -0.3, threshold: -8, release: 80 } },
        { name: 'Brick Wall', parameters: { ...plugin.defaultPreset, ceiling: -0.5, threshold: -1, release: 50, lookahead: 10 } }
      );
    }

    return presets;
  }
}

export const pluginHostService = new PluginHostService();
