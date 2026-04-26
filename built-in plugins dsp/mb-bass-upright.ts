import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBassUprightPlugin: PluginDefinition = {
    id: 'mb-bass-upright', slug: 'mb-bass-upright', name: 'MB Upright Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Acoustic upright bass', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.7 }, { type: 'sine', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.4, release: 0.5 },
    parameters: [
      { id: 'body', name: 'Body', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { body: 0.7, volume: 0.8 },
  };

export default MbBassUprightPlugin;
