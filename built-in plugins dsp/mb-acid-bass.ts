import type { PluginDefinition } from '../server/services/pluginHostService';

const MbAcidBassPlugin: PluginDefinition = {
    id: 'mb-acid-bass',
    slug: 'mb-acid-bass',
    name: 'MB Acid Bass',
    category: 'instrument',
    type: 'synth',
    version: '1.0.0',
    description: 'Classic 303-style acid bass synthesizer with squelchy filter',
    author: 'Max Booster',
    oscillators: [
      { type: 'sawtooth', detune: 0, gain: 0.7 },
      { type: 'square', detune: 0, gain: 0.3 },
    ],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
    parameters: [
      { id: 'waveform', name: 'Waveform', type: 'choice', defaultValue: 'sawtooth', choices: ['sawtooth', 'square'], automatable: false },
      { id: 'cutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 400, minValue: 50, maxValue: 5000, unit: 'Hz', automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'env_mod', name: 'Envelope Mod', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.2, minValue: 0.01, maxValue: 2, unit: 's', automatable: true },
      { id: 'accent', name: 'Accent', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'slide', name: 'Slide Time', type: 'float', defaultValue: 0.05, minValue: 0, maxValue: 0.5, unit: 's', automatable: true },
      { id: 'distortion', name: 'Distortion', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { waveform: 'sawtooth', cutoff: 400, resonance: 0.8, env_mod: 0.7, decay: 0.2, accent: 0.5, slide: 0.05, distortion: 0.2, volume: 0.8 },
  };

export default MbAcidBassPlugin;
