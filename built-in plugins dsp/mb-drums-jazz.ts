import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDrumsJazzPlugin: PluginDefinition = {
    id: 'mb-drums-jazz', slug: 'mb-drums-jazz', name: 'MB Jazz Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Smooth jazz brush kit', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.6 }, { type: 'noise', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.4 },
    parameters: [
      { id: 'brush', name: 'Brush', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brush: 0.6, volume: 0.7 },
  };

export default MbDrumsJazzPlugin;
