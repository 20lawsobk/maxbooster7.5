import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthTrancePlugin: PluginDefinition = {
    id: 'mb-synth-trance', slug: 'mb-synth-trance', name: 'MB Trance Lead', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Classic trance lead', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -10, gain: 0.25 }, { type: 'sawtooth', detune: 10, gain: 0.25 }, { type: 'square', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 },
    parameters: [
      { id: 'gate', name: 'Gate', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { gate: 0.7, volume: 0.8 },
  };

export default MbSynthTrancePlugin;
