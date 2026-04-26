import type { PluginDefinition } from '../server/services/pluginHostService';

const MbChorusClassicPlugin: PluginDefinition = { id: 'mb-chorus-classic', slug: 'mb-chorus-classic', name: 'MB Classic Chorus', category: 'effect', type: 'chorus', version: '1.0.0', description: 'Rich stereo chorus', author: 'Max Booster', grade: 'A', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 10, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 1, depth: 0.5, mix: 0.5 } };

export default MbChorusClassicPlugin;
