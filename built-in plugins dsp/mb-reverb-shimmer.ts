import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbShimmerPlugin: PluginDefinition = { id: 'mb-reverb-shimmer', slug: 'mb-reverb-shimmer', name: 'MB Shimmer Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Pitched shimmer reverb', author: 'Max Booster', grade: 'A', parameters: [{ id: 'shimmer', name: 'Shimmer', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 4.0, minValue: 1, maxValue: 15, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { shimmer: 0.6, decay: 4.0, mix: 0.4 } };

export default MbReverbShimmerPlugin;
