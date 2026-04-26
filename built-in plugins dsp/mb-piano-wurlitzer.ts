import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPianoWurlitzerPlugin: PluginDefinition = {
    id: 'mb-piano-wurlitzer', slug: 'mb-piano-wurlitzer', name: 'MB Wurlitzer', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Vintage Wurlitzer electric piano', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.6 }, { type: 'square', detune: 0, gain: 0.15 }],
    envelope: { attack: 0.002, decay: 0.5, sustain: 0.4, release: 0.5 },
    parameters: [
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { drive: 0.3, volume: 0.8 },
  };

export default MbPianoWurlitzerPlugin;
