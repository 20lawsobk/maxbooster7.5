import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVintageLimiterPlugin: PluginDefinition = {
    id: 'mb-vintage-limiter',
    slug: 'mb-vintage-limiter',
    name: 'MB Vintage Limiter',
    category: 'effect',
    type: 'limiter',
    version: '1.0.0',
    description: 'Warm optical-style limiter for gentle peak control',
    author: 'Max Booster', grade: 'A',
    parameters: [
      { id: 'input', name: 'Input Gain', type: 'float', defaultValue: 0, minValue: 0, maxValue: 24, unit: 'dB', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 100, minValue: 10, maxValue: 1000, unit: 'ms', automatable: true },
      { id: 'ceiling', name: 'Ceiling', type: 'float', defaultValue: -0.3, minValue: -6, maxValue: 0, unit: 'dB', automatable: true },
      { id: 'character', name: 'Character', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'auto_release', name: 'Auto Release', type: 'bool', defaultValue: true, automatable: false },
      { id: 'link_stereo', name: 'Link Stereo', type: 'bool', defaultValue: true, automatable: false },
    ],
    defaultPreset: { input: 0, release: 100, ceiling: -0.3, character: 0.5, auto_release: true, link_stereo: true },
  };

export default MbVintageLimiterPlugin;
