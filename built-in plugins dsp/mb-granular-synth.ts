import type { PluginDefinition } from '../server/services/pluginHostService';

const MbGranularSynthPlugin: PluginDefinition = {
    id: 'mb-granular-synth',
    slug: 'mb-granular-synth',
    name: 'MB Granular Synth',
    category: 'instrument',
    type: 'wavetable',
    version: '1.0.0',
    description: 'Advanced granular synthesizer for textural and ambient sounds',
    author: 'Max Booster', grade: 'A',
    oscillators: [
      { type: 'sine', detune: 0, gain: 0.5 },
      { type: 'triangle', detune: 0, gain: 0.3 },
    ],
    envelope: { attack: 0.5, decay: 1.0, sustain: 0.7, release: 2.0 },
    parameters: [
      { id: 'grain_size', name: 'Grain Size', type: 'float', defaultValue: 50, minValue: 1, maxValue: 500, unit: 'ms', automatable: true },
      { id: 'grain_density', name: 'Grain Density', type: 'float', defaultValue: 20, minValue: 1, maxValue: 100, unit: 'grains/s', automatable: true },
      { id: 'position', name: 'Sample Position', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'position_spread', name: 'Position Spread', type: 'float', defaultValue: 0.1, minValue: 0, maxValue: 1, automatable: true },
      { id: 'pitch_spread', name: 'Pitch Spread', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, unit: 'semitones', automatable: true },
      { id: 'pan_spread', name: 'Pan Spread', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'reverse', name: 'Reverse Probability', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'freeze', name: 'Freeze', type: 'bool', defaultValue: false, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { grain_size: 50, grain_density: 20, position: 0, position_spread: 0.1, pitch_spread: 0, pan_spread: 0.5, reverse: 0, freeze: false, volume: 0.8 },
  };

export default MbGranularSynthPlugin;
