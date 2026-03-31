import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerStringsPlugin: PluginDefinition = { id: 'mb-sampler-strings', slug: 'mb-sampler-strings', name: 'MB String Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Orchestral string samples', author: 'Max Booster', oscillators: [], envelope: { attack: 0.3, decay: 0.5, sustain: 0.85, release: 0.8 }, parameters: [{ id: 'articulation', name: 'Articulation', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'expression', name: 'Expression', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { articulation: 0.5, expression: 0.7, volume: 0.8 } };

export default MbSamplerStringsPlugin;
