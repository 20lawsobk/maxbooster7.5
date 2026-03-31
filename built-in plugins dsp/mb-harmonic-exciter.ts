import type { PluginDefinition } from '../server/services/pluginHostService';

const MbHarmonicExciterPlugin: PluginDefinition = {
    id: 'mb-harmonic-exciter',
    slug: 'mb-harmonic-exciter',
    name: 'MB Harmonic Exciter',
    category: 'effect',
    type: 'distortion',
    version: '1.0.0',
    description: 'Multiband harmonic enhancer for adding presence and clarity',
    author: 'Max Booster',
    parameters: [
      { id: 'low_amount', name: 'Low Harmonics', type: 'float', defaultValue: 0, minValue: 0, maxValue: 100, unit: '%', automatable: true },
      { id: 'mid_amount', name: 'Mid Harmonics', type: 'float', defaultValue: 0, minValue: 0, maxValue: 100, unit: '%', automatable: true },
      { id: 'high_amount', name: 'High Harmonics', type: 'float', defaultValue: 0, minValue: 0, maxValue: 100, unit: '%', automatable: true },
      { id: 'crossover_low', name: 'Low Crossover', type: 'float', defaultValue: 200, minValue: 50, maxValue: 500, unit: 'Hz', automatable: true },
      { id: 'crossover_high', name: 'High Crossover', type: 'float', defaultValue: 4000, minValue: 1000, maxValue: 10000, unit: 'Hz', automatable: true },
      { id: 'odd_even', name: 'Odd/Even Balance', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { low_amount: 0, mid_amount: 0, high_amount: 0, crossover_low: 200, crossover_high: 4000, odd_even: 0.5, mix: 0.5 },
  };

export default MbHarmonicExciterPlugin;
