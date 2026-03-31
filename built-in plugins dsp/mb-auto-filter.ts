import type { PluginDefinition } from '../server/services/pluginHostService';

const MbAutoFilterPlugin: PluginDefinition = {
    id: 'mb-auto-filter',
    slug: 'mb-auto-filter',
    name: 'MB Auto Filter',
    category: 'effect',
    type: 'eq',
    version: '1.0.0',
    description: 'Resonant filter with envelope follower and LFO modulation',
    author: 'Max Booster',
    parameters: [
      { id: 'filter_type', name: 'Filter Type', type: 'choice', defaultValue: 'lowpass', choices: ['lowpass', 'highpass', 'bandpass', 'notch'], automatable: false },
      { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 1000, minValue: 20, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'env_amount', name: 'Envelope Amount', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, unit: '%', automatable: true },
      { id: 'env_attack', name: 'Env Attack', type: 'float', defaultValue: 10, minValue: 0.1, maxValue: 500, unit: 'ms', automatable: true },
      { id: 'env_release', name: 'Env Release', type: 'float', defaultValue: 100, minValue: 1, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'lfo_rate', name: 'LFO Rate', type: 'float', defaultValue: 1, minValue: 0.01, maxValue: 20, unit: 'Hz', automatable: true },
      { id: 'lfo_amount', name: 'LFO Amount', type: 'float', defaultValue: 0, minValue: 0, maxValue: 100, unit: '%', automatable: true },
      { id: 'lfo_shape', name: 'LFO Shape', type: 'choice', defaultValue: 'sine', choices: ['sine', 'triangle', 'square', 'sawtooth', 'random'], automatable: false },
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { filter_type: 'lowpass', cutoff: 1000, resonance: 0.5, env_amount: 0, env_attack: 10, env_release: 100, lfo_rate: 1, lfo_amount: 0, lfo_shape: 'sine', drive: 0 },
  };

export default MbAutoFilterPlugin;
