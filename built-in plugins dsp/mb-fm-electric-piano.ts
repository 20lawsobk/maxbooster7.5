import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmElectricPianoPlugin: PluginDefinition = {
    id: 'mb-fm-electric-piano',
    slug: 'mb-fm-electric-piano',
    name: 'MB FM Electric Piano',
    category: 'instrument',
    type: 'fm',
    version: '1.0.0',
    description: 'Classic DX7-style FM electric piano with warm tines and bells',
    author: 'Max Booster',
    oscillators: [
      { type: 'sine', detune: 0, gain: 0.5 },
      { type: 'sine', detune: 0, gain: 0.3 },
      { type: 'sine', detune: 0, gain: 0.2 },
    ],
    envelope: { attack: 0.001, decay: 2.0, sustain: 0.2, release: 0.5 },
    parameters: [
      { id: 'algorithm', name: 'Algorithm', type: 'int', defaultValue: 1, minValue: 1, maxValue: 32, automatable: false },
      { id: 'mod_index', name: 'Modulation Index', type: 'float', defaultValue: 2.5, minValue: 0, maxValue: 10, automatable: true },
      { id: 'ratio', name: 'Operator Ratio', type: 'float', defaultValue: 14, minValue: 0.5, maxValue: 32, automatable: true },
      { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 2.0, minValue: 0.1, maxValue: 10, unit: 's', automatable: true },
      { id: 'velocity_sens', name: 'Velocity Sensitivity', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: false },
      { id: 'tremolo_rate', name: 'Tremolo Rate', type: 'float', defaultValue: 5, minValue: 0, maxValue: 20, unit: 'Hz', automatable: true },
      { id: 'tremolo_depth', name: 'Tremolo Depth', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { algorithm: 1, mod_index: 2.5, ratio: 14, brightness: 0.6, decay: 2.0, velocity_sens: 0.7, tremolo_rate: 5, tremolo_depth: 0.3, volume: 0.8 },
  };

export default MbFmElectricPianoPlugin;
