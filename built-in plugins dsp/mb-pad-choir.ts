import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPadChoirPlugin: PluginDefinition = {
    id: 'mb-pad-choir', slug: 'mb-pad-choir', name: 'MB Choir Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Vocal choir pad', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.5 }, { type: 'triangle', detune: -5, gain: 0.25 }, { type: 'triangle', detune: 5, gain: 0.25 }],
    envelope: { attack: 0.6, decay: 0.5, sustain: 0.85, release: 1.8 },
    parameters: [
      { id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vowel: 0.5, volume: 0.7 },
  };

export default MbPadChoirPlugin;
