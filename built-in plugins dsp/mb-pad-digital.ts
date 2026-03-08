import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPadDigitalPlugin: PluginDefinition = {
    id: 'mb-pad-digital', slug: 'mb-pad-digital', name: 'MB Digital Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Clean digital pad', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.4 }, { type: 'triangle', detune: 1200, gain: 0.3 }, { type: 'sine', detune: 1900, gain: 0.3 }],
    envelope: { attack: 0.5, decay: 0.8, sustain: 0.85, release: 1.5 },
    parameters: [
      { id: 'shimmer', name: 'Shimmer', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { shimmer: 0.5, volume: 0.7 },
  };

export default MbPadDigitalPlugin;
