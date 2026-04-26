import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqAirPlugin: PluginDefinition = { id: 'mb-eq-air', slug: 'mb-eq-air', name: 'MB Air EQ', category: 'effect', type: 'eq', version: '1.0.0', description: 'High frequency air band', author: 'Max Booster', grade: 'A', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 12000, minValue: 8000, maxValue: 20000, automatable: true }, { id: 'amount', name: 'Amount', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }], defaultPreset: { freq: 12000, amount: 0 } };

export default MbEqAirPlugin;
