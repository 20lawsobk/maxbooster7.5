import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCreativePsychoPlugin: PluginDefinition = { id: 'mb-creative-psycho', slug: 'mb-creative-psycho', name: 'MB Psychoacoustic Enhancer', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Loudness perception enhancement using psychoacoustic principles', author: 'Max Booster', parameters: [{ id: 'lowEnd', name: 'Low End', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'presence', name: 'Presence', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'air', name: 'Air', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'density', name: 'Density', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { lowEnd: 0.5, presence: 0.5, air: 0.3, density: 0.4 } };

export default MbCreativePsychoPlugin;
