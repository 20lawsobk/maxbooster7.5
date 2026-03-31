import type { PluginDefinition } from '../server/services/pluginHostService';

const MbChorusPlugin: PluginDefinition = { id: 'mb-chorus', slug: 'mb-chorus', name: 'MB Chorus', category: 'effect', type: 'chorus', version: '1.0.0', description: 'Rich stereo chorus effect', author: 'Max Booster', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 1.0, minValue: 0.1, maxValue: 10, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'delay', name: 'Delay', type: 'float', defaultValue: 7, minValue: 1, maxValue: 30, automatable: true }, { id: 'spread', name: 'Stereo Spread', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Dry/Wet Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 1.0, depth: 0.5, delay: 7, spread: 0.7, mix: 0.5 } };

export default MbChorusPlugin;
