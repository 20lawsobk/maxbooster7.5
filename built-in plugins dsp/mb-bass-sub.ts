import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBassSubPlugin: PluginDefinition = {
    id: 'mb-bass-sub', slug: 'mb-bass-sub', name: 'MB Sub Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Deep sub bass', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }],
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2 },
    parameters: [
      { id: 'sub', name: 'Sub', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { sub: 1.0, volume: 0.8 },
  };

export default MbBassSubPlugin;
