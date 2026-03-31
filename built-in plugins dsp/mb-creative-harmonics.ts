import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCreativeHarmonicsPlugin: PluginDefinition = { id: 'mb-creative-harmonics', slug: 'mb-creative-harmonics', name: 'MB Harmonics Generator', category: 'effect', type: 'distortion' as any, version: '1.0.0', description: 'Generate odd and even harmonics for warmth and presence', author: 'Max Booster', parameters: [{ id: 'oddHarmonics', name: 'Odd Harmonics', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'evenHarmonics', name: 'Even Harmonics', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'order', name: 'Max Order', type: 'float', defaultValue: 5, minValue: 2, maxValue: 12, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { oddHarmonics: 0.3, evenHarmonics: 0.3, order: 5, mix: 0.5 } };

export default MbCreativeHarmonicsPlugin;
