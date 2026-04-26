import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPadStringsPlugin: PluginDefinition = {
    id: 'mb-pad-strings', slug: 'mb-pad-strings', name: 'MB String Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Orchestral string pad', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sawtooth', detune: -5, gain: 0.35 }, { type: 'sawtooth', detune: 5, gain: 0.35 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 1.0, decay: 0.5, sustain: 0.8, release: 2.5 },
    parameters: [
      { id: 'ensemble', name: 'Ensemble', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { ensemble: 0.6, volume: 0.7 },
  };

export default MbPadStringsPlugin;
