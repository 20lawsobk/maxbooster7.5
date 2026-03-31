import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPadAmbientPlugin: PluginDefinition = {
    id: 'mb-pad-ambient', slug: 'mb-pad-ambient', name: 'MB Ambient Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Ethereal ambient texture', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.3 }, { type: 'triangle', detune: 1200, gain: 0.25 }, { type: 'sine', detune: 1900, gain: 0.25 }, { type: 'triangle', detune: -700, gain: 0.2 }],
    envelope: { attack: 2.0, decay: 1.0, sustain: 0.9, release: 4.0 },
    parameters: [
      { id: 'space', name: 'Space', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { space: 0.8, volume: 0.6 },
  };

export default MbPadAmbientPlugin;
