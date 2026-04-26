import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeStutterPlugin: PluginDefinition = { id: 'mb-time-stutter', slug: 'mb-time-stutter', name: 'MB Stutter Effect', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Rhythmic audio stutter with tempo sync', author: 'Max Booster', grade: 'A', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 8, minValue: 1, maxValue: 32, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }, { id: 'shape', name: 'Shape', type: 'float', defaultValue: 0, minValue: 0, maxValue: 3, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 8, depth: 1, shape: 0, mix: 1 } };

export default MbTimeStutterPlugin;
