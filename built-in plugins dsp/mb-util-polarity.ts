import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilPolarityPlugin: PluginDefinition = { id: 'mb-util-polarity', slug: 'mb-util-polarity', name: 'MB Polarity Flip', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Independent channel polarity inversion', author: 'Max Booster', grade: 'A', parameters: [{ id: 'flipL', name: 'Flip Left', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: false }, { id: 'flipR', name: 'Flip Right', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: false }, { id: 'delay', name: 'Time Align', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, automatable: true }], defaultPreset: { flipL: 0, flipR: 0, delay: 0 } };

export default MbUtilPolarityPlugin;
