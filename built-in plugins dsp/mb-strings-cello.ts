import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStringsCelloPlugin: PluginDefinition = {
    id: 'mb-strings-cello', slug: 'mb-strings-cello', name: 'MB Solo Cello', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Deep expressive cello', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'sine', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.1, decay: 0.5, sustain: 0.8, release: 0.6 },
    parameters: [
      { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vibrato: 0.35, volume: 0.8 },
  };

export default MbStringsCelloPlugin;
