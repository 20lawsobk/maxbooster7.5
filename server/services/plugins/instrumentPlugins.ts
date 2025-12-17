import type { PluginDefinition } from '../pluginHostService';

export const PIANO_PLUGINS: PluginDefinition[] = [
  {
    id: 'mb-piano-grand', slug: 'mb-piano-grand', name: 'MB Grand Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Concert grand piano with rich harmonics', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.6 }, { type: 'sine', detune: 0.5, gain: 0.3 }, { type: 'sine', detune: 1200, gain: 0.1 }],
    envelope: { attack: 0.002, decay: 0.3, sustain: 0.6, release: 0.5 },
    parameters: [
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'dynamics', name: 'Dynamics', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brightness: 0.5, dynamics: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-piano-upright', slug: 'mb-piano-upright', name: 'MB Upright Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Classic upright piano with warm character', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.5 }, { type: 'sine', detune: 2, gain: 0.4 }],
    envelope: { attack: 0.003, decay: 0.25, sustain: 0.5, release: 0.4 },
    parameters: [
      { id: 'warmth', name: 'Warmth', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { warmth: 0.6, volume: 0.8 },
  },
  {
    id: 'mb-piano-electric', slug: 'mb-piano-electric', name: 'MB Electric Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Rhodes-style electric piano with bell-like tones', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }, { type: 'triangle', detune: 0.3, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.8, sustain: 0.3, release: 0.6 },
    parameters: [
      { id: 'bell', name: 'Bell', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'tremolo', name: 'Tremolo', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { bell: 0.5, tremolo: 0.3, volume: 0.8 },
  },
  {
    id: 'mb-piano-wurlitzer', slug: 'mb-piano-wurlitzer', name: 'MB Wurlitzer', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Vintage Wurlitzer electric piano', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.6 }, { type: 'square', detune: 0, gain: 0.15 }],
    envelope: { attack: 0.002, decay: 0.5, sustain: 0.4, release: 0.5 },
    parameters: [
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { drive: 0.3, volume: 0.8 },
  },
  {
    id: 'mb-piano-clavinet', slug: 'mb-piano-clavinet', name: 'MB Clavinet', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Funky clavinet with percussive attack', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'square', detune: 0.1, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.2, release: 0.2 },
    parameters: [
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brightness: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-piano-honkytonk', slug: 'mb-piano-honkytonk', name: 'MB Honky Tonk', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Detuned honky tonk piano', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 8, gain: 0.5 }, { type: 'triangle', detune: -8, gain: 0.5 }],
    envelope: { attack: 0.002, decay: 0.4, sustain: 0.5, release: 0.4 },
    parameters: [
      { id: 'detune', name: 'Detune', type: 'float', defaultValue: 8, minValue: 0, maxValue: 20, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { detune: 8, volume: 0.8 },
  },
  {
    id: 'mb-piano-toy', slug: 'mb-piano-toy', name: 'MB Toy Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Bright toy piano with metallic tone', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 1200, gain: 0.4 }, { type: 'triangle', detune: 0, gain: 0.6 }],
    envelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.3 },
    parameters: [
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brightness: 0.9, volume: 0.7 },
  },
  {
    id: 'mb-piano-prepared', slug: 'mb-piano-prepared', name: 'MB Prepared Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Experimental prepared piano textures', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.4 }, { type: 'noise', detune: 0, gain: 0.2 }],
    envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.8 },
    parameters: [
      { id: 'muted', name: 'Muted', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { muted: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-piano-felt', slug: 'mb-piano-felt', name: 'MB Felt Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Soft felt-dampened intimate piano', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.01, decay: 0.6, sustain: 0.4, release: 1.2 },
    parameters: [
      { id: 'softness', name: 'Softness', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { softness: 0.8, volume: 0.6 },
  },
  {
    id: 'mb-piano-crystal', slug: 'mb-piano-crystal', name: 'MB Crystal Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Bright crystalline piano with shimmering highs', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.5 }, { type: 'sine', detune: 1200, gain: 0.3 }, { type: 'sine', detune: 2400, gain: 0.2 }],
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.5, release: 0.8 },
    parameters: [
      { id: 'shimmer', name: 'Shimmer', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { shimmer: 0.6, volume: 0.8 },
  },
];

export const STRINGS_PLUGINS: PluginDefinition[] = [
  {
    id: 'mb-strings-ensemble', slug: 'mb-strings-ensemble', name: 'MB String Ensemble', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Lush orchestral string section', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -5, gain: 0.3 }, { type: 'sawtooth', detune: 5, gain: 0.3 }, { type: 'triangle', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.3, decay: 0.5, sustain: 0.8, release: 1.0 },
    parameters: [
      { id: 'warmth', name: 'Warmth', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'ensemble', name: 'Ensemble', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { warmth: 0.6, ensemble: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-strings-violin', slug: 'mb-strings-violin', name: 'MB Solo Violin', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Expressive solo violin', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'triangle', detune: 3, gain: 0.4 }],
    envelope: { attack: 0.05, decay: 0.3, sustain: 0.9, release: 0.4 },
    parameters: [
      { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vibrato: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-strings-viola', slug: 'mb-strings-viola', name: 'MB Solo Viola', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Rich solo viola', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'triangle', detune: 2, gain: 0.5 }],
    envelope: { attack: 0.08, decay: 0.4, sustain: 0.85, release: 0.5 },
    parameters: [
      { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vibrato: 0.4, volume: 0.8 },
  },
  {
    id: 'mb-strings-cello', slug: 'mb-strings-cello', name: 'MB Solo Cello', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Deep expressive cello', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'sine', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.1, decay: 0.5, sustain: 0.8, release: 0.6 },
    parameters: [
      { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vibrato: 0.35, volume: 0.8 },
  },
  {
    id: 'mb-strings-bass', slug: 'mb-strings-bass', name: 'MB Contrabass', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Deep orchestral contrabass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'sine', detune: -1200, gain: 0.5 }],
    envelope: { attack: 0.15, decay: 0.5, sustain: 0.7, release: 0.8 },
    parameters: [
      { id: 'body', name: 'Body', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { body: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-strings-pizzicato', slug: 'mb-strings-pizzicato', name: 'MB Pizzicato', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Plucked string pizzicato', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.7 }, { type: 'sine', detune: 1200, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2 },
    parameters: [
      { id: 'pluck', name: 'Pluck', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { pluck: 0.8, volume: 0.8 },
  },
  {
    id: 'mb-strings-tremolo', slug: 'mb-strings-tremolo', name: 'MB Tremolo Strings', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Dramatic tremolo strings', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -3, gain: 0.35 }, { type: 'sawtooth', detune: 3, gain: 0.35 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.9, release: 0.3 },
    parameters: [
      { id: 'speed', name: 'Speed', type: 'float', defaultValue: 8, minValue: 4, maxValue: 16, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { speed: 8, volume: 0.8 },
  },
  {
    id: 'mb-strings-spiccato', slug: 'mb-strings-spiccato', name: 'MB Spiccato', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Short bouncing bow articulation', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'triangle', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.15 },
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0.8, volume: 0.8 },
  },
  {
    id: 'mb-strings-legato', slug: 'mb-strings-legato', name: 'MB Legato Strings', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Smooth connected legato strings', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -7, gain: 0.25 }, { type: 'sawtooth', detune: 7, gain: 0.25 }, { type: 'triangle', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 1.5 },
    parameters: [
      { id: 'glide', name: 'Glide', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { glide: 0.3, volume: 0.8 },
  },
  {
    id: 'mb-strings-cinematic', slug: 'mb-strings-cinematic', name: 'MB Cinematic Strings', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Epic cinematic string orchestra', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -10, gain: 0.2 }, { type: 'sawtooth', detune: 10, gain: 0.2 }, { type: 'sawtooth', detune: 0, gain: 0.3 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.8, decay: 0.5, sustain: 0.85, release: 2.0 },
    parameters: [
      { id: 'width', name: 'Width', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { width: 0.8, volume: 0.8 },
  },
];

export const DRUMS_PLUGINS: PluginDefinition[] = [
  {
    id: 'mb-drums-acoustic', slug: 'mb-drums-acoustic', name: 'MB Acoustic Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Natural acoustic drum kit', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }, { type: 'noise', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.3 },
    parameters: [
      { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'room', name: 'Room', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { punch: 0.7, room: 0.3, volume: 0.8 },
  },
  {
    id: 'mb-drums-electronic', slug: 'mb-drums-electronic', name: 'MB Electronic Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Classic 808/909 electronic drums', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }, { type: 'noise', detune: 0, gain: 0.6 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.4 },
    parameters: [
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 2, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { decay: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-drums-hiphop', slug: 'mb-drums-hiphop', name: 'MB Hip Hop Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Hard-hitting hip hop drums', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }, { type: 'noise', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.001, decay: 0.25, sustain: 0.0, release: 0.35 },
    parameters: [
      { id: 'thump', name: 'Thump', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { thump: 0.8, volume: 0.85 },
  },
  {
    id: 'mb-drums-rock', slug: 'mb-drums-rock', name: 'MB Rock Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Powerful rock drum kit', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.9 }, { type: 'noise', detune: 0, gain: 0.6 }],
    envelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.25 },
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0.9, volume: 0.8 },
  },
  {
    id: 'mb-drums-jazz', slug: 'mb-drums-jazz', name: 'MB Jazz Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Smooth jazz brush kit', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.6 }, { type: 'noise', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.4 },
    parameters: [
      { id: 'brush', name: 'Brush', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brush: 0.6, volume: 0.7 },
  },
  {
    id: 'mb-drums-trap', slug: 'mb-drums-trap', name: 'MB Trap Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Modern trap drums with 808 bass', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }, { type: 'noise', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.6 },
    parameters: [
      { id: 'slide', name: 'Slide', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { slide: 0.5, volume: 0.9 },
  },
  {
    id: 'mb-drums-edm', slug: 'mb-drums-edm', name: 'MB EDM Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'High-energy EDM drums', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.9 }, { type: 'noise', detune: 0, gain: 0.7 }],
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.15 },
    parameters: [
      { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.95, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { punch: 0.95, volume: 0.85 },
  },
  {
    id: 'mb-drums-lofi', slug: 'mb-drums-lofi', name: 'MB Lo-Fi Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Dusty lo-fi hip hop drums', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }, { type: 'noise', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.003, decay: 0.25, sustain: 0.05, release: 0.3 },
    parameters: [
      { id: 'vinyl', name: 'Vinyl', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vinyl: 0.6, volume: 0.75 },
  },
  {
    id: 'mb-drums-percussion', slug: 'mb-drums-percussion', name: 'MB World Percussion', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Ethnic world percussion', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.5 }, { type: 'noise', detune: 0, gain: 0.3 }, { type: 'sine', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.002, decay: 0.2, sustain: 0.0, release: 0.25 },
    parameters: [
      { id: 'tone', name: 'Tone', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { tone: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-drums-cinematic', slug: 'mb-drums-cinematic', name: 'MB Cinematic Drums', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Epic cinematic percussion', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }, { type: 'noise', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 1.0 },
    parameters: [
      { id: 'impact', name: 'Impact', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { impact: 0.9, volume: 0.8 },
  },
];

export const BASS_PLUGINS: PluginDefinition[] = [
  {
    id: 'mb-bass-sub', slug: 'mb-bass-sub', name: 'MB Sub Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Deep sub bass', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }],
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2 },
    parameters: [
      { id: 'sub', name: 'Sub', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { sub: 1.0, volume: 0.8 },
  },
  {
    id: 'mb-bass-reese', slug: 'mb-bass-reese', name: 'MB Reese Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Detuned reese bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -7, gain: 0.5 }, { type: 'sawtooth', detune: 7, gain: 0.5 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.3 },
    parameters: [
      { id: 'detune', name: 'Detune', type: 'float', defaultValue: 7, minValue: 0, maxValue: 30, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { detune: 7, volume: 0.8 },
  },
  {
    id: 'mb-bass-wobble', slug: 'mb-bass-wobble', name: 'MB Wobble Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Dubstep wobble bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'square', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2 },
    parameters: [
      { id: 'lfoRate', name: 'LFO Rate', type: 'float', defaultValue: 4, minValue: 0.5, maxValue: 20, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { lfoRate: 4, volume: 0.8 },
  },
  {
    id: 'mb-bass-808', slug: 'mb-bass-808', name: 'MB 808 Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Classic 808 kick bass', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }],
    envelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.5 },
    parameters: [
      { id: 'slide', name: 'Slide', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { slide: 0.3, volume: 0.9 },
  },
  {
    id: 'mb-bass-acid', slug: 'mb-bass-acid', name: 'MB Acid Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'TB-303 style acid bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.8 }, { type: 'square', detune: 0, gain: 0.2 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.3, release: 0.1 },
    parameters: [
      { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 2000, minValue: 100, maxValue: 10000, automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { cutoff: 2000, resonance: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-bass-fm', slug: 'mb-bass-fm', name: 'MB FM Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Punchy FM bass', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.5, release: 0.15 },
    parameters: [
      { id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 3, minValue: 0, maxValue: 10, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { modIndex: 3, volume: 0.8 },
  },
  {
    id: 'mb-bass-electric', slug: 'mb-bass-electric', name: 'MB Electric Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Fingered electric bass', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.6 }, { type: 'sine', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.3 },
    parameters: [
      { id: 'tone', name: 'Tone', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { tone: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-bass-slap', slug: 'mb-bass-slap', name: 'MB Slap Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Funky slap bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'triangle', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.3, release: 0.2 },
    parameters: [
      { id: 'snap', name: 'Snap', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { snap: 0.8, volume: 0.8 },
  },
  {
    id: 'mb-bass-upright', slug: 'mb-bass-upright', name: 'MB Upright Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Acoustic upright bass', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.7 }, { type: 'sine', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.4, release: 0.5 },
    parameters: [
      { id: 'body', name: 'Body', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { body: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-bass-moog', slug: 'mb-bass-moog', name: 'MB Moog Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Classic Moog-style bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.7 }, { type: 'square', detune: -1200, gain: 0.3 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2 },
    parameters: [
      { id: 'filter', name: 'Filter', type: 'float', defaultValue: 3000, minValue: 100, maxValue: 10000, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { filter: 3000, volume: 0.8 },
  },
];

export const PAD_PLUGINS: PluginDefinition[] = [
  {
    id: 'mb-pad-warm', slug: 'mb-pad-warm', name: 'MB Warm Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Warm analog-style pad', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -7, gain: 0.25 }, { type: 'sawtooth', detune: 7, gain: 0.25 }, { type: 'triangle', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.8, decay: 1.0, sustain: 0.9, release: 2.0 },
    parameters: [
      { id: 'warmth', name: 'Warmth', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { warmth: 0.7, volume: 0.7 },
  },
  {
    id: 'mb-pad-digital', slug: 'mb-pad-digital', name: 'MB Digital Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Clean digital pad', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.4 }, { type: 'triangle', detune: 1200, gain: 0.3 }, { type: 'sine', detune: 1900, gain: 0.3 }],
    envelope: { attack: 0.5, decay: 0.8, sustain: 0.85, release: 1.5 },
    parameters: [
      { id: 'shimmer', name: 'Shimmer', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { shimmer: 0.5, volume: 0.7 },
  },
  {
    id: 'mb-pad-strings', slug: 'mb-pad-strings', name: 'MB String Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Orchestral string pad', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -5, gain: 0.35 }, { type: 'sawtooth', detune: 5, gain: 0.35 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 1.0, decay: 0.5, sustain: 0.8, release: 2.5 },
    parameters: [
      { id: 'ensemble', name: 'Ensemble', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { ensemble: 0.6, volume: 0.7 },
  },
  {
    id: 'mb-pad-ambient', slug: 'mb-pad-ambient', name: 'MB Ambient Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Ethereal ambient texture', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.3 }, { type: 'triangle', detune: 1200, gain: 0.25 }, { type: 'sine', detune: 1900, gain: 0.25 }, { type: 'triangle', detune: -700, gain: 0.2 }],
    envelope: { attack: 2.0, decay: 1.0, sustain: 0.9, release: 4.0 },
    parameters: [
      { id: 'space', name: 'Space', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { space: 0.8, volume: 0.6 },
  },
  {
    id: 'mb-pad-choir', slug: 'mb-pad-choir', name: 'MB Choir Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Vocal choir pad', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.5 }, { type: 'triangle', detune: -5, gain: 0.25 }, { type: 'triangle', detune: 5, gain: 0.25 }],
    envelope: { attack: 0.6, decay: 0.5, sustain: 0.85, release: 1.8 },
    parameters: [
      { id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vowel: 0.5, volume: 0.7 },
  },
  {
    id: 'mb-pad-glass', slug: 'mb-pad-glass', name: 'MB Glass Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Crystalline glass textures', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.4 }, { type: 'sine', detune: 1200, gain: 0.3 }, { type: 'sine', detune: 2400, gain: 0.2 }, { type: 'sine', detune: 3600, gain: 0.1 }],
    envelope: { attack: 0.3, decay: 0.8, sustain: 0.7, release: 2.0 },
    parameters: [
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.65, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brightness: 0.7, volume: 0.65 },
  },
  {
    id: 'mb-pad-dark', slug: 'mb-pad-dark', name: 'MB Dark Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Moody dark atmosphere', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -12, gain: 0.3 }, { type: 'sawtooth', detune: 12, gain: 0.3 }, { type: 'sine', detune: -1200, gain: 0.4 }],
    envelope: { attack: 1.5, decay: 1.0, sustain: 0.8, release: 3.0 },
    parameters: [
      { id: 'darkness', name: 'Darkness', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { darkness: 0.8, volume: 0.7 },
  },
  {
    id: 'mb-pad-evolving', slug: 'mb-pad-evolving', name: 'MB Evolving Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Slowly morphing textures', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -10, gain: 0.2 }, { type: 'triangle', detune: 0, gain: 0.3 }, { type: 'sawtooth', detune: 10, gain: 0.2 }, { type: 'sine', detune: 1200, gain: 0.3 }],
    envelope: { attack: 3.0, decay: 2.0, sustain: 0.85, release: 5.0 },
    parameters: [
      { id: 'morph', name: 'Morph', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { morph: 0.5, volume: 0.6 },
  },
  {
    id: 'mb-pad-vintage', slug: 'mb-pad-vintage', name: 'MB Vintage Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Classic analog synth pad', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.4 }, { type: 'square', detune: -5, gain: 0.3 }, { type: 'square', detune: 5, gain: 0.3 }],
    envelope: { attack: 0.4, decay: 0.6, sustain: 0.8, release: 1.2 },
    parameters: [
      { id: 'filter', name: 'Filter', type: 'float', defaultValue: 5000, minValue: 500, maxValue: 15000, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { filter: 5000, volume: 0.7 },
  },
  {
    id: 'mb-pad-cinematic', slug: 'mb-pad-cinematic', name: 'MB Cinematic Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Epic cinematic atmosphere', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -15, gain: 0.2 }, { type: 'sawtooth', detune: 15, gain: 0.2 }, { type: 'triangle', detune: 0, gain: 0.3 }, { type: 'sine', detune: -1200, gain: 0.3 }],
    envelope: { attack: 2.5, decay: 1.5, sustain: 0.9, release: 4.0 },
    parameters: [
      { id: 'epic', name: 'Epic', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { epic: 0.8, volume: 0.7 },
  },
];

export const SYNTH_PLUGINS: PluginDefinition[] = [
  {
    id: 'mb-synth-analog', slug: 'mb-synth-analog', name: 'MB Analog Lead', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Classic analog lead synth', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'square', detune: -0.1, gain: 0.3 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4 },
    parameters: [
      { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 5000, minValue: 100, maxValue: 20000, automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { cutoff: 5000, resonance: 0.3, volume: 0.8 },
  },
  {
    id: 'mb-synth-supersaw', slug: 'mb-synth-supersaw', name: 'MB Supersaw', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Massive supersaw stack', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -15, gain: 0.15 }, { type: 'sawtooth', detune: -7, gain: 0.15 }, { type: 'sawtooth', detune: 0, gain: 0.2 }, { type: 'sawtooth', detune: 7, gain: 0.15 }, { type: 'sawtooth', detune: 15, gain: 0.15 }],
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5 },
    parameters: [
      { id: 'detune', name: 'Detune', type: 'float', defaultValue: 15, minValue: 0, maxValue: 50, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { detune: 15, volume: 0.75 },
  },
  {
    id: 'mb-synth-pluck', slug: 'mb-synth-pluck', name: 'MB Synth Pluck', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Short plucky synth', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'triangle', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.15 },
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0.8, volume: 0.8 },
  },
  {
    id: 'mb-synth-arp', slug: 'mb-synth-arp', name: 'MB Arp Synth', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Arpeggiated synth sounds', author: 'Max Booster',
    oscillators: [{ type: 'square', detune: 0, gain: 0.5 }, { type: 'sawtooth', detune: 5, gain: 0.5 }],
    envelope: { attack: 0.001, decay: 0.15, sustain: 0.3, release: 0.1 },
    parameters: [
      { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 3000, minValue: 100, maxValue: 15000, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { cutoff: 3000, volume: 0.8 },
  },
  {
    id: 'mb-synth-mono', slug: 'mb-synth-mono', name: 'MB Mono Lead', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Fat monophonic lead', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'square', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.3 },
    parameters: [
      { id: 'glide', name: 'Glide', type: 'float', defaultValue: 0.1, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { glide: 0.1, volume: 0.8 },
  },
  {
    id: 'mb-synth-poly', slug: 'mb-synth-poly', name: 'MB Poly Synth', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Polyphonic synth', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -3, gain: 0.35 }, { type: 'sawtooth', detune: 3, gain: 0.35 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.5 },
    parameters: [
      { id: 'spread', name: 'Spread', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { spread: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-synth-retro', slug: 'mb-synth-retro', name: 'MB Retro Synth', category: 'instrument', type: 'analog', version: '1.0.0',
    description: '80s retro synth tones', author: 'Max Booster',
    oscillators: [{ type: 'square', detune: 0, gain: 0.4 }, { type: 'sawtooth', detune: 0, gain: 0.4 }, { type: 'triangle', detune: 1200, gain: 0.2 }],
    envelope: { attack: 0.1, decay: 0.5, sustain: 0.5, release: 0.6 },
    parameters: [
      { id: 'chorus', name: 'Chorus', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { chorus: 0.5, volume: 0.8 },
  },
  {
    id: 'mb-synth-trance', slug: 'mb-synth-trance', name: 'MB Trance Lead', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Classic trance lead', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -10, gain: 0.25 }, { type: 'sawtooth', detune: 10, gain: 0.25 }, { type: 'square', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 },
    parameters: [
      { id: 'gate', name: 'Gate', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { gate: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-synth-dubstep', slug: 'mb-synth-dubstep', name: 'MB Dubstep Synth', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Aggressive dubstep sounds', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'square', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.8, release: 0.1 },
    parameters: [
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { drive: 0.7, volume: 0.8 },
  },
  {
    id: 'mb-synth-chiptune', slug: 'mb-synth-chiptune', name: 'MB Chiptune', category: 'instrument', type: 'analog', version: '1.0.0',
    description: '8-bit chiptune sounds', author: 'Max Booster',
    oscillators: [{ type: 'square', detune: 0, gain: 0.8 }, { type: 'triangle', detune: 0, gain: 0.2 }],
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.5, release: 0.1 },
    parameters: [
      { id: 'duty', name: 'Duty', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 0.9, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { duty: 0.5, volume: 0.7 },
  },
];

export const FM_PLUGINS: PluginDefinition[] = [
  { id: 'mb-fm-dx', slug: 'mb-fm-dx', name: 'MB DX7 Classic', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Classic 6-operator FM synthesis', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }], envelope: { attack: 0.01, decay: 0.5, sustain: 0.5, release: 0.3 }, parameters: [{ id: 'algorithm', name: 'Algorithm', type: 'float', defaultValue: 1, minValue: 1, maxValue: 32, automatable: false }, { id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 3, minValue: 0, maxValue: 20, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { algorithm: 1, modIndex: 3, feedback: 0.3, volume: 0.8 } },
  { id: 'mb-fm-epiano', slug: 'mb-fm-epiano', name: 'MB FM E-Piano', category: 'instrument', type: 'fm', version: '1.0.0', description: 'FM electric piano tines', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.001, decay: 0.8, sustain: 0.3, release: 0.5 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 2.5, minValue: 0, maxValue: 15, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 2.5, brightness: 0.6, volume: 0.8 } },
  { id: 'mb-fm-bass', slug: 'mb-fm-bass', name: 'MB FM Bass', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Punchy FM bass', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.9 }], envelope: { attack: 0.001, decay: 0.2, sustain: 0.6, release: 0.15 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 4, minValue: 0, maxValue: 15, automatable: true }, { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 4, punch: 0.7, volume: 0.85 } },
  { id: 'mb-fm-bell', slug: 'mb-fm-bell', name: 'MB FM Bell', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Crystalline FM bells', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.001, decay: 1.5, sustain: 0.2, release: 1.0 }, parameters: [{ id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 3.5, minValue: 1, maxValue: 8, automatable: true }, { id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 5, minValue: 0, maxValue: 20, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { ratio: 3.5, modIndex: 5, volume: 0.7 } },
  { id: 'mb-fm-brass', slug: 'mb-fm-brass', name: 'MB FM Brass', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Bright FM brass', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }], envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.3 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 6, minValue: 0, maxValue: 20, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 6, brightness: 0.7, volume: 0.8 } },
  { id: 'mb-fm-organ', slug: 'mb-fm-organ', name: 'MB FM Organ', category: 'instrument', type: 'fm', version: '1.0.0', description: 'FM drawbar organ', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 2, minValue: 0, maxValue: 10, automatable: true }, { id: 'percussive', name: 'Percussive', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 2, percussive: 0.5, volume: 0.8 } },
  { id: 'mb-fm-strings', slug: 'mb-fm-strings', name: 'MB FM Strings', category: 'instrument', type: 'fm', version: '1.0.0', description: 'FM string ensemble', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.3, decay: 0.5, sustain: 0.8, release: 0.8 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 1.5, minValue: 0, maxValue: 8, automatable: true }, { id: 'ensemble', name: 'Ensemble', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 1.5, ensemble: 0.6, volume: 0.75 } },
  { id: 'mb-fm-pluck', slug: 'mb-fm-pluck', name: 'MB FM Pluck', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Short FM pluck', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }], envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.15 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 8, minValue: 0, maxValue: 20, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.25, minValue: 0.05, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 8, decay: 0.25, volume: 0.8 } },
  { id: 'mb-fm-mallet', slug: 'mb-fm-mallet', name: 'MB FM Mallet', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Marimba-like FM mallet', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.75 }], envelope: { attack: 0.001, decay: 0.6, sustain: 0.1, release: 0.4 }, parameters: [{ id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 4, minValue: 1, maxValue: 10, automatable: true }, { id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 3, minValue: 0, maxValue: 15, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { ratio: 4, modIndex: 3, volume: 0.8 } },
  { id: 'mb-fm-lead', slug: 'mb-fm-lead', name: 'MB FM Lead', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Cutting FM lead', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }], envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 7, minValue: 0, maxValue: 20, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 7, brightness: 0.8, volume: 0.8 } },
];

export const WAVETABLE_PLUGINS: PluginDefinition[] = [
  { id: 'mb-wt-serum', slug: 'mb-wt-serum', name: 'MB Serum Style', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Modern wavetable synthesis', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.7 }], envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.4 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'morph', name: 'Morph', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0, morph: 0.5, volume: 0.8 } },
  { id: 'mb-wt-massive', slug: 'mb-wt-massive', name: 'MB Massive Bass', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Huge wavetable bass', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.9 }], envelope: { attack: 0.001, decay: 0.3, sustain: 0.7, release: 0.2 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'intensity', name: 'Intensity', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.3, intensity: 0.8, volume: 0.85 } },
  { id: 'mb-wt-evolving', slug: 'mb-wt-evolving', name: 'MB Evolving Pad', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Slowly morphing wavetable pad', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.6 }], envelope: { attack: 2.0, decay: 1.0, sustain: 0.8, release: 3.0 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'lfoRate', name: 'LFO Rate', type: 'float', defaultValue: 0.1, minValue: 0.01, maxValue: 2, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0, lfoRate: 0.1, volume: 0.7 } },
  { id: 'mb-wt-pluck', slug: 'mb-wt-pluck', name: 'MB WT Pluck', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Sharp wavetable pluck', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.8 }], envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.5, attack: 0.8, volume: 0.8 } },
  { id: 'mb-wt-digital', slug: 'mb-wt-digital', name: 'MB Digital Keys', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Clean digital wavetable keys', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.01, decay: 0.5, sustain: 0.5, release: 0.4 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.2, brightness: 0.6, volume: 0.8 } },
  { id: 'mb-wt-growl', slug: 'mb-wt-growl', name: 'MB Growl Bass', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Aggressive growling bass', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.9 }], envelope: { attack: 0.001, decay: 0.15, sustain: 0.8, release: 0.1 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'growl', name: 'Growl', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.7, growl: 0.8, volume: 0.85 } },
  { id: 'mb-wt-vocal', slug: 'mb-wt-vocal', name: 'MB Vocal Wavetable', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Vocal formant wavetables', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.1, decay: 0.4, sustain: 0.7, release: 0.5 }, parameters: [{ id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'formant', name: 'Formant', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { vowel: 0.5, formant: 0.5, volume: 0.75 } },
  { id: 'mb-wt-supersaw', slug: 'mb-wt-supersaw', name: 'MB WT Supersaw', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Wavetable supersaw stack', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: -10, gain: 0.35 }, { type: 'sawtooth', detune: 10, gain: 0.35 }], envelope: { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'detune', name: 'Detune', type: 'float', defaultValue: 10, minValue: 0, maxValue: 50, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.4, detune: 10, volume: 0.75 } },
  { id: 'mb-wt-cinematic', slug: 'mb-wt-cinematic', name: 'MB Cinematic WT', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Epic cinematic wavetable', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }], envelope: { attack: 1.5, decay: 1.0, sustain: 0.85, release: 2.5 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'epic', name: 'Epic', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.3, epic: 0.8, volume: 0.75 } },
  { id: 'mb-wt-arp', slug: 'mb-wt-arp', name: 'MB WT Arp', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Wavetable arpeggiated sounds', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.7 }], envelope: { attack: 0.001, decay: 0.15, sustain: 0.4, release: 0.1 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 5000, minValue: 200, maxValue: 15000, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.6, cutoff: 5000, volume: 0.8 } },
];

export const SAMPLER_PLUGINS: PluginDefinition[] = [
  { id: 'mb-sampler-piano', slug: 'mb-sampler-piano', name: 'MB Piano Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Multi-sampled grand piano', author: 'Max Booster', oscillators: [], envelope: { attack: 0.001, decay: 0.5, sustain: 0.8, release: 0.5 }, parameters: [{ id: 'velocity', name: 'Velocity', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 5, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { velocity: 0.8, release: 0.5, volume: 0.8 } },
  { id: 'mb-sampler-strings', slug: 'mb-sampler-strings', name: 'MB String Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Orchestral string samples', author: 'Max Booster', oscillators: [], envelope: { attack: 0.3, decay: 0.5, sustain: 0.85, release: 0.8 }, parameters: [{ id: 'articulation', name: 'Articulation', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'expression', name: 'Expression', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { articulation: 0.5, expression: 0.7, volume: 0.8 } },
  { id: 'mb-sampler-drums', slug: 'mb-sampler-drums', name: 'MB Drum Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Multi-layer drum samples', author: 'Max Booster', oscillators: [], envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 }, parameters: [{ id: 'kit', name: 'Kit', type: 'float', defaultValue: 1, minValue: 1, maxValue: 8, automatable: false }, { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { kit: 1, punch: 0.7, volume: 0.85 } },
  { id: 'mb-sampler-choir', slug: 'mb-sampler-choir', name: 'MB Choir Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Cathedral choir samples', author: 'Max Booster', oscillators: [], envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1.0 }, parameters: [{ id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { vowel: 0.5, vibrato: 0.4, volume: 0.75 } },
  { id: 'mb-sampler-brass', slug: 'mb-sampler-brass', name: 'MB Brass Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Orchestral brass ensemble', author: 'Max Booster', oscillators: [], envelope: { attack: 0.05, decay: 0.3, sustain: 0.75, release: 0.3 }, parameters: [{ id: 'section', name: 'Section', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'dynamics', name: 'Dynamics', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { section: 0.5, dynamics: 0.7, volume: 0.8 } },
  { id: 'mb-sampler-woodwind', slug: 'mb-sampler-woodwind', name: 'MB Woodwind Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Orchestral woodwinds', author: 'Max Booster', oscillators: [], envelope: { attack: 0.08, decay: 0.4, sustain: 0.7, release: 0.4 }, parameters: [{ id: 'instrument', name: 'Instrument', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'breath', name: 'Breath', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { instrument: 0.5, breath: 0.5, volume: 0.75 } },
  { id: 'mb-sampler-guitar', slug: 'mb-sampler-guitar', name: 'MB Guitar Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Acoustic and electric guitars', author: 'Max Booster', oscillators: [], envelope: { attack: 0.005, decay: 0.5, sustain: 0.5, release: 0.4 }, parameters: [{ id: 'type', name: 'Type', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'pick', name: 'Pick Position', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { type: 0.5, pick: 0.5, volume: 0.8 } },
  { id: 'mb-sampler-world', slug: 'mb-sampler-world', name: 'MB World Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Ethnic world instruments', author: 'Max Booster', oscillators: [], envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.5 }, parameters: [{ id: 'region', name: 'Region', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'expression', name: 'Expression', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { region: 0.5, expression: 0.7, volume: 0.8 } },
  { id: 'mb-sampler-synth', slug: 'mb-sampler-synth', name: 'MB Synth Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Classic synth samples', author: 'Max Booster', oscillators: [], envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.4 }, parameters: [{ id: 'era', name: 'Era', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'filter', name: 'Filter', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { era: 0.5, filter: 0.6, volume: 0.8 } },
  { id: 'mb-sampler-texture', slug: 'mb-sampler-texture', name: 'MB Texture Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Ambient textures and soundscapes', author: 'Max Booster', oscillators: [], envelope: { attack: 1.0, decay: 1.0, sustain: 0.9, release: 2.0 }, parameters: [{ id: 'texture', name: 'Texture', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'space', name: 'Space', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { texture: 0.5, space: 0.7, volume: 0.7 } },
];
