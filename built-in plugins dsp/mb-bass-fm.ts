import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBassFmPlugin: PluginDefinition = {
    id: 'mb-bass-fm', slug: 'mb-bass-fm', name: 'MB FM Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Punchy FM bass', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.5, release: 0.15 },
    parameters: [
      { id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 3, minValue: 0, maxValue: 10, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { modIndex: 3, volume: 0.8 },
  };

export default MbBassFmPlugin;
