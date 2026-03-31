import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPianoElectricPlugin: PluginDefinition = {
    id: 'mb-piano-electric', slug: 'mb-piano-electric', name: 'MB Electric Piano', category: 'instrument', type: 'piano', version: '1.0.0',
    description: 'Rhodes-style electric piano with bell-like tones', author: 'Max Booster',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }, { type: 'triangle', detune: 0.3, gain: 0.3 }],
    envelope: { attack: 0.001, decay: 0.8, sustain: 0.3, release: 0.6 },
    parameters: [
      { id: 'bell', name: 'Bell', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'tremolo', name: 'Tremolo', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { bell: 0.5, tremolo: 0.3, volume: 0.8 },
  };

export default MbPianoElectricPlugin;
