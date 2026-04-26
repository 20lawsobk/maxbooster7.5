import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStringsPizzicatoPlugin: PluginDefinition = {
    id: 'mb-strings-pizzicato', slug: 'mb-strings-pizzicato', name: 'MB Pizzicato', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Plucked string pizzicato', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.7 }, { type: 'sine', detune: 1200, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2 },
    parameters: [
      { id: 'pluck', name: 'Pluck', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { pluck: 0.8, volume: 0.8 },
  };

export default MbStringsPizzicatoPlugin;
