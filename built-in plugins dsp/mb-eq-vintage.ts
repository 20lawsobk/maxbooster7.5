import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqVintagePlugin: PluginDefinition = { id: 'mb-eq-vintage', slug: 'mb-eq-vintage', name: 'MB Vintage EQ', category: 'effect', type: 'eq', version: '1.0.0', description: 'Pultec-style vintage EQ', author: 'Max Booster', parameters: [{ id: 'lowBoost', name: 'Low Boost', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, automatable: true }, { id: 'lowCut', name: 'Low Cut', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, automatable: true }, { id: 'highBoost', name: 'High Boost', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, automatable: true }, { id: 'highAtten', name: 'High Atten', type: 'float', defaultValue: 0, minValue: 0, maxValue: 10, automatable: true }], defaultPreset: { lowBoost: 0, lowCut: 0, highBoost: 0, highAtten: 0 } };

export default MbEqVintagePlugin;
