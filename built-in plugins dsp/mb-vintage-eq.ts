import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVintageEqPlugin: PluginDefinition = {
    id: 'mb-vintage-eq',
    slug: 'mb-vintage-eq',
    name: 'MB Vintage EQ',
    category: 'effect',
    type: 'eq',
    version: '1.0.0',
    description: 'Classic Pultec-style passive EQ with musical curves',
    author: 'Max Booster',
    parameters: [
      { id: 'low_freq', name: 'Low Frequency', type: 'choice', defaultValue: '100', choices: ['20', '30', '60', '100'], automatable: false },
      { id: 'low_boost', name: 'Low Boost', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, unit: 'dB', automatable: true },
      { id: 'low_atten', name: 'Low Attenuation', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, unit: 'dB', automatable: true },
      { id: 'high_freq', name: 'High Frequency', type: 'choice', defaultValue: '10k', choices: ['3k', '4k', '5k', '8k', '10k', '12k', '16k'], automatable: false },
      { id: 'high_boost', name: 'High Boost', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, unit: 'dB', automatable: true },
      { id: 'high_bandwidth', name: 'High Bandwidth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'high_atten_freq', name: 'High Atten Freq', type: 'choice', defaultValue: '10k', choices: ['5k', '10k', '20k'], automatable: false },
      { id: 'high_atten', name: 'High Attenuation', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, unit: 'dB', automatable: true },
      { id: 'output', name: 'Output', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, unit: 'dB', automatable: true },
    ],
    defaultPreset: { low_freq: '100', low_boost: 0, low_atten: 0, high_freq: '10k', high_boost: 0, high_bandwidth: 0.5, high_atten_freq: '10k', high_atten: 0, output: 0 },
  };

export default MbVintageEqPlugin;
