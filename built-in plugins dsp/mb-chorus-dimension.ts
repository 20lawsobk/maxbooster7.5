import type { PluginDefinition } from '../server/services/pluginHostService';

const MbChorusDimensionPlugin: PluginDefinition = { id: 'mb-chorus-dimension', slug: 'mb-chorus-dimension', name: 'MB Dimension', category: 'effect', type: 'chorus', version: '1.0.0', description: 'Dimension D style', author: 'Max Booster', grade: 'A', parameters: [{ id: 'mode', name: 'Mode', type: 'float', defaultValue: 2, minValue: 1, maxValue: 4, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { mode: 2, mix: 0.5 } };

export default MbChorusDimensionPlugin;
