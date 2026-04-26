import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqDynamicPlugin: PluginDefinition = { id: 'mb-eq-dynamic', slug: 'mb-eq-dynamic', name: 'MB Dynamic EQ', category: 'effect', type: 'eq', version: '1.0.0', description: 'Frequency-dependent dynamics', author: 'Max Booster', grade: 'A', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 3000, minValue: 100, maxValue: 15000, automatable: true }, { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -20, minValue: -60, maxValue: 0, automatable: true }, { id: 'range', name: 'Range', type: 'float', defaultValue: -6, minValue: -24, maxValue: 24, automatable: true }], defaultPreset: { freq: 3000, threshold: -20, range: -6 } };

export default MbEqDynamicPlugin;
