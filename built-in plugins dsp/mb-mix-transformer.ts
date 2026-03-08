import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixTransformerPlugin: PluginDefinition = { id: 'mb-mix-transformer', slug: 'mb-mix-transformer', name: 'MB Transformer', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Audio transformer emulation for harmonic warmth', author: 'Max Booster', parameters: [{ id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'impedance', name: 'Impedance', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'lowEnd', name: 'Low End', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'output', name: 'Output', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { drive: 0.3, impedance: 0.5, lowEnd: 0.5, output: 0.8 } };

export default MbMixTransformerPlugin;
