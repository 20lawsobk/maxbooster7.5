import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPianoCrystalPlugin: PluginDefinition = {
    id: 'mb-piano-crystal', slug: 'mb-piano-crystal', name: 'MB Crystal Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Bright crystalline piano with shimmering highs', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.5 }, { type: 'sine', detune: 1200, gain: 0.3 }, { type: 'sine', detune: 2400, gain: 0.2 }],
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.5, release: 0.8 },
    parameters: [
      { id: 'shimmer', name: 'Shimmer', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { shimmer: 0.6, volume: 0.8 },
  };

export default MbPianoCrystalPlugin;
