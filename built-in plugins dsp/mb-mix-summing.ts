import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixSummingPlugin: PluginDefinition = { id: 'mb-mix-summing', slug: 'mb-mix-summing', name: 'MB Analog Summing', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Analog summing bus emulation for warmth and width', author: 'Max Booster', parameters: [{ id: 'saturation', name: 'Saturation', type: 'float', defaultValue: 0.25, minValue: 0, maxValue: 1, automatable: true }, { id: 'width', name: 'Width', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'color', name: 'Color', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'output', name: 'Output', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { saturation: 0.25, width: 0.5, color: 0.4, output: 0.8 } };

export default MbMixSummingPlugin;
