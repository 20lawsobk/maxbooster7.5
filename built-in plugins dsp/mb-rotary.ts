import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRotaryPlugin: PluginDefinition = { id: 'mb-rotary', slug: 'mb-rotary', name: 'MB Rotary Speaker', category: 'effect', type: 'chorus', version: '1.0.0', description: 'Leslie speaker simulation', author: 'Max Booster', grade: 'A', parameters: [{ id: 'speed', name: 'Speed', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { speed: 0.5, depth: 0.7, mix: 0.6 } };

export default MbRotaryPlugin;
