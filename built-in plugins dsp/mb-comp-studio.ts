import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCompStudioPlugin: PluginDefinition = { id: 'mb-comp-studio', slug: 'mb-comp-studio', name: 'MB Studio Comp', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Clean studio compressor', author: 'Max Booster', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -20, minValue: -60, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 4, minValue: 1, maxValue: 20, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 10, minValue: 0.1, maxValue: 100, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 100, minValue: 10, maxValue: 1000, automatable: true }], defaultPreset: { threshold: -20, ratio: 4, attack: 10, release: 100 } };

export default MbCompStudioPlugin;
