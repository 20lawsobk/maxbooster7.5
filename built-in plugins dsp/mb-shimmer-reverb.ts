import type { PluginDefinition } from '../server/services/pluginHostService';

const MbShimmerReverbPlugin: PluginDefinition = {
    id: 'mb-shimmer-reverb',
    slug: 'mb-shimmer-reverb',
    name: 'MB Shimmer Reverb',
    category: 'effect',
    type: 'reverb',
    version: '1.0.0',
    description: 'Ethereal shimmer reverb with octave-shifted tails',
    author: 'Max Booster',
    parameters: [
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true },
      { id: 'decay', name: 'Decay', type: 'float', defaultValue: 5, minValue: 1, maxValue: 30, unit: 's', automatable: true },
      { id: 'shimmer', name: 'Shimmer Amount', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'pitch', name: 'Shimmer Pitch', type: 'choice', defaultValue: '+12', choices: ['-12', '-5', '+5', '+7', '+12', '+19', '+24'], automatable: false },
      { id: 'feedback', name: 'Shimmer Feedback', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 0.95, automatable: true },
      { id: 'modulation', name: 'Modulation', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'diffusion', name: 'Diffusion', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'damping', name: 'Damping', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { mix: 0.4, decay: 5, shimmer: 0.5, pitch: '+12', feedback: 0.5, modulation: 0.3, diffusion: 0.8, damping: 0.5 },
  };

export default MbShimmerReverbPlugin;
