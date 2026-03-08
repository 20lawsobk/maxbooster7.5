import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPianoPreparedPlugin: PluginDefinition = {
    id: 'mb-piano-prepared', slug: 'mb-piano-prepared', name: 'MB Prepared Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Experimental prepared piano textures', author: 'Max Booster',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.4 }, { type: 'noise', detune: 0, gain: 0.2 }],
    envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.8 },
    parameters: [
      { id: 'muted', name: 'Muted', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { muted: 0.5, volume: 0.8 },
  };

export default MbPianoPreparedPlugin;
