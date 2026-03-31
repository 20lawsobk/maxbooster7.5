import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBassAcidPlugin: PluginDefinition = {
    id: 'mb-bass-acid', slug: 'mb-bass-acid', name: 'MB Acid Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'TB-303 style acid bass', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.8 }, { type: 'square', detune: 0, gain: 0.2 }],
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.3, release: 0.1 },
    parameters: [
      { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 2000, minValue: 100, maxValue: 10000, automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { cutoff: 2000, resonance: 0.7, volume: 0.8 },
  };

export default MbBassAcidPlugin;
