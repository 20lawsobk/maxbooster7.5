import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTransientShaperPlugin: PluginDefinition = {
    id: 'mb-transient-shaper',
    slug: 'mb-transient-shaper',
    name: 'MB Transient Shaper',
    category: 'effect',
    type: 'compressor',
    version: '1.0.0',
    description: 'Attack and sustain control for drums and percussive sounds',
    author: 'Max Booster',
    parameters: [
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, unit: '%', automatable: true },
      { id: 'sustain', name: 'Sustain', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, unit: '%', automatable: true },
      { id: 'attack_time', name: 'Attack Time', type: 'float', defaultValue: 5, minValue: 0.1, maxValue: 50, unit: 'ms', automatable: true },
      { id: 'sustain_time', name: 'Sustain Time', type: 'float', defaultValue: 100, minValue: 10, maxValue: 500, unit: 'ms', automatable: true },
      { id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'output', name: 'Output', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, unit: 'dB', automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { attack: 0, sustain: 0, attack_time: 5, sustain_time: 100, sensitivity: 0.5, output: 0, mix: 1 },
  };

export default MbTransientShaperPlugin;
