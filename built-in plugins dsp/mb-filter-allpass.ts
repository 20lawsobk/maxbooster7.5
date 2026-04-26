import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterAllpassPlugin: PluginDefinition = { id: 'mb-filter-allpass', slug: 'mb-filter-allpass', name: 'MB Allpass Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Phase-shifting allpass filter for dispersion effects', author: 'Max Booster', grade: 'A', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 2000, minValue: 100, maxValue: 15000, automatable: true }, { id: 'q', name: 'Q', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 20, automatable: true }, { id: 'stages', name: 'Stages', type: 'float', defaultValue: 2, minValue: 1, maxValue: 8, automatable: false }], defaultPreset: { freq: 2000, q: 1, stages: 2 } };

export default MbFilterAllpassPlugin;
