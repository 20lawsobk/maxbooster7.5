import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterStateVarPlugin: PluginDefinition = { id: 'mb-filter-state-var', slug: 'mb-filter-state-var', name: 'MB State Variable Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Multi-mode state variable filter with continuous morphing', author: 'Max Booster', grade: 'A', parameters: [{ id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 3000, minValue: 20, maxValue: 20000, automatable: true }, { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'morph', name: 'LP/BP/HP Morph', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { cutoff: 3000, resonance: 0.3, morph: 0, mix: 1 } };

export default MbFilterStateVarPlugin;
