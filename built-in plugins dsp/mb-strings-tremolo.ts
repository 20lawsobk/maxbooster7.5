import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStringsTremoloPlugin: PluginDefinition = {
    id: 'mb-strings-tremolo', slug: 'mb-strings-tremolo', name: 'MB Tremolo Strings', category: 'instrument', type: 'strings', version: '1.0.0',
    description: 'Dramatic tremolo strings', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -3, gain: 0.35 }, { type: 'sawtooth', detune: 3, gain: 0.35 }, { type: 'triangle', detune: 0, gain: 0.3 }],
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.9, release: 0.3 },
    parameters: [
      { id: 'speed', name: 'Speed', type: 'float', defaultValue: 8, minValue: 4, maxValue: 16, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { speed: 8, volume: 0.8 },
  };

export default MbStringsTremoloPlugin;
