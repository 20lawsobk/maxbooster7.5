import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqBassPlugin: PluginDefinition = { id: 'mb-eq-bass', slug: 'mb-eq-bass', name: 'MB Bass Enhancer', category: 'effect', type: 'eq', version: '1.0.0', description: 'Low end enhancement', author: 'Max Booster', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 60, minValue: 30, maxValue: 120, automatable: true }, { id: 'amount', name: 'Amount', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'harmonics', name: 'Harmonics', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { freq: 60, amount: 0, harmonics: 0.3 } };

export default MbEqBassPlugin;
