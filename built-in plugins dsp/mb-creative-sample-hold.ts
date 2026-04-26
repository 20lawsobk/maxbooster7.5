import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCreativeSampleHoldPlugin: PluginDefinition = { id: 'mb-creative-sample-hold', slug: 'mb-creative-sample-hold', name: 'MB Sample & Hold', category: 'effect', type: 'distortion' as any, version: '1.0.0', description: 'Random sample-and-hold modulation for glitchy textures', author: 'Max Booster', grade: 'A', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 10, minValue: 0.1, maxValue: 100, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'target', name: 'Target', type: 'float', defaultValue: 0, minValue: 0, maxValue: 2, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 10, depth: 0.5, target: 0, mix: 0.5 } };

export default MbCreativeSampleHoldPlugin;
