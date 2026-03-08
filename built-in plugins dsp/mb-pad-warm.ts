import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPadWarmPlugin: PluginDefinition = {
    id: 'mb-pad-warm', slug: 'mb-pad-warm', name: 'MB Warm Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Warm analog-style pad', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -7, gain: 0.25 }, { type: 'sawtooth', detune: 7, gain: 0.25 }, { type: 'triangle', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.8, decay: 1.0, sustain: 0.9, release: 2.0 },
    parameters: [
      { id: 'warmth', name: 'Warmth', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { warmth: 0.7, volume: 0.7 },
  };

export default MbPadWarmPlugin;
