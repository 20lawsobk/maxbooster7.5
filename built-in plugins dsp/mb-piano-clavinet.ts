import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPianoClavinetPlugin: PluginDefinition = {
    id: 'mb-piano-clavinet', slug: 'mb-piano-clavinet', name: 'MB Clavinet', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Funky clavinet with percussive attack', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'square', detune: 0.1, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.2, release: 0.2 },
    parameters: [
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { brightness: 0.7, volume: 0.8 },
  };

export default MbPianoClavinetPlugin;
