import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqSurgicalPlugin: PluginDefinition = { id: 'mb-eq-surgical', slug: 'mb-eq-surgical', name: 'MB Surgical EQ', category: 'effect', type: 'eq', version: '1.0.0', description: 'Precision notch filtering', author: 'Max Booster', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 1000, minValue: 20, maxValue: 20000, automatable: true }, { id: 'gain', name: 'Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, automatable: true }, { id: 'q', name: 'Q', type: 'float', defaultValue: 5, minValue: 0.5, maxValue: 20, automatable: true }], defaultPreset: { freq: 1000, gain: 0, q: 5 } };

export default MbEqSurgicalPlugin;
