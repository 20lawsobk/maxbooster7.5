import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStereoImagerPlugin: PluginDefinition = {
    id: 'mb-stereo-imager',
    slug: 'mb-stereo-imager',
    name: 'MB Stereo Imager',
    category: 'effect',
    type: 'eq',
    version: '1.0.0',
    description: 'Multiband stereo width processor for spatial enhancement',
    author: 'Max Booster', grade: 'A',
    parameters: [
      { id: 'low_width', name: 'Low Width', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 2, automatable: true },
      { id: 'mid_width', name: 'Mid Width', type: 'float', defaultValue: 1, minValue: 0, maxValue: 2, automatable: true },
      { id: 'high_width', name: 'High Width', type: 'float', defaultValue: 1.5, minValue: 0, maxValue: 2, automatable: true },
      { id: 'crossover_low', name: 'Low Crossover', type: 'float', defaultValue: 200, minValue: 50, maxValue: 500, unit: 'Hz', automatable: true },
      { id: 'crossover_high', name: 'High Crossover', type: 'float', defaultValue: 5000, minValue: 1000, maxValue: 15000, unit: 'Hz', automatable: true },
      { id: 'correlation', name: 'Correlation', type: 'bool', defaultValue: true, automatable: false },
      { id: 'mono_below', name: 'Mono Below', type: 'float', defaultValue: 80, minValue: 0, maxValue: 300, unit: 'Hz', automatable: true },
    ],
    defaultPreset: { low_width: 0.5, mid_width: 1, high_width: 1.5, crossover_low: 200, crossover_high: 5000, correlation: true, mono_below: 80 },
  };

export default MbStereoImagerPlugin;
