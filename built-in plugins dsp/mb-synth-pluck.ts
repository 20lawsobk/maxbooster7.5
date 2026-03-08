import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthPluckPlugin: PluginDefinition = {
    id: 'mb-synth-pluck', slug: 'mb-synth-pluck', name: 'MB Synth Pluck', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Short plucky synth', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'triangle', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.15 },
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0.8, volume: 0.8 },
  };

export default MbSynthPluckPlugin;
