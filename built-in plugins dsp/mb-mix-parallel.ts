import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixParallelPlugin: PluginDefinition = { id: 'mb-mix-parallel', slug: 'mb-mix-parallel', name: 'MB Parallel Processor', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Parallel processing chain with dry/wet blend and sidechain', author: 'Max Booster', grade: 'A', parameters: [{ id: 'blend', name: 'Blend', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'input', name: 'Input Gain', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'output', name: 'Output', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { blend: 0.5, input: 0, output: 0.8 } };

export default MbMixParallelPlugin;
