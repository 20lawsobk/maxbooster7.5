import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBassReesePlugin: PluginDefinition = {
    id: 'mb-bass-reese', slug: 'mb-bass-reese', name: 'MB Reese Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Detuned reese bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -7, gain: 0.5 }, { type: 'sawtooth', detune: 7, gain: 0.5 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.3 },
    parameters: [
      { id: 'detune', name: 'Detune', type: 'float', defaultValue: 7, minValue: 0, maxValue: 30, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { detune: 7, volume: 0.8 },
  };

export default MbBassReesePlugin;
