import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqPresencePlugin: PluginDefinition = { id: 'mb-eq-presence', slug: 'mb-eq-presence', name: 'MB Presence EQ', category: 'effect', type: 'eq', version: '1.0.0', description: 'Vocal presence enhancer', author: 'Max Booster', grade: 'A', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 3000, minValue: 1500, maxValue: 6000, automatable: true }, { id: 'amount', name: 'Amount', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }], defaultPreset: { freq: 3000, amount: 0 } };

export default MbEqPresencePlugin;
