import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPianoHonkytonkPlugin: PluginDefinition = {
    id: 'mb-piano-honkytonk', slug: 'mb-piano-honkytonk', name: 'MB Honky Tonk', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Detuned honky tonk piano', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'triangle', detune: 8, gain: 0.5 }, { type: 'triangle', detune: -8, gain: 0.5 }],
    envelope: { attack: 0.002, decay: 0.4, sustain: 0.5, release: 0.4 },
    parameters: [
      { id: 'detune', name: 'Detune', type: 'float', defaultValue: 8, minValue: 0, maxValue: 20, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { detune: 8, volume: 0.8 },
  };

export default MbPianoHonkytonkPlugin;
