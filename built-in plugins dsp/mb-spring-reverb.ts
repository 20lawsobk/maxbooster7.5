import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSpringReverbPlugin: PluginDefinition = {
    id: 'mb-spring-reverb',
    slug: 'mb-spring-reverb',
    name: 'MB Spring Reverb',
    category: 'effect',
    type: 'reverb',
    version: '1.0.0',
    description: 'Classic spring reverb emulation with drip and splash',
    author: 'Max Booster',
    parameters: [
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 2, minValue: 0.5, maxValue: 6, unit: 's', automatable: true },
      { id: 'tension', name: 'Spring Tension', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'drip', name: 'Drip', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'diffusion', name: 'Diffusion', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'low_cut', name: 'Low Cut', type: 'float', defaultValue: 100, minValue: 20, maxValue: 500, unit: 'Hz', automatable: true },
      { id: 'high_cut', name: 'High Cut', type: 'float', defaultValue: 8000, minValue: 1000, maxValue: 20000, unit: 'Hz', automatable: true },
    ],
    defaultPreset: { mix: 0.3, decay: 2, tension: 0.5, drip: 0.3, diffusion: 0.5, low_cut: 100, high_cut: 8000 },
  };

export default MbSpringReverbPlugin;
