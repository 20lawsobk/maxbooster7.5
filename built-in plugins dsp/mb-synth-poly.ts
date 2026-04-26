import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthPolyPlugin: PluginDefinition = {
    id: 'mb-synth-poly', slug: 'mb-synth-poly', name: 'MB Poly Synth', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Polyphonic synth', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sawtooth', detune: -3, gain: 0.35 }, { type: 'sawtooth', detune: 3, gain: 0.35 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.5 },
    parameters: [
      { id: 'spread', name: 'Spread', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { spread: 0.5, volume: 0.8 },
  };

export default MbSynthPolyPlugin;
