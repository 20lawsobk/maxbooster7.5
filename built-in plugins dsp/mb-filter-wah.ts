import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterWahPlugin: PluginDefinition = { id: 'mb-filter-wah', slug: 'mb-filter-wah', name: 'MB Wah Pedal', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Classic wah pedal with expression control', author: 'Max Booster', grade: 'A', parameters: [{ id: 'position', name: 'Position', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'range', name: 'Range', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.5, range: 0.7, resonance: 0.6, mix: 1 } };

export default MbFilterWahPlugin;
