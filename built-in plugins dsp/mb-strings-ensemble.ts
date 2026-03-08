import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStringsEnsemblePlugin: PluginDefinition = {
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
  };

export default MbStringsEnsemblePlugin;
