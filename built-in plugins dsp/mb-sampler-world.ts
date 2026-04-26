import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerWorldPlugin: PluginDefinition = { id: 'mb-sampler-world', slug: 'mb-sampler-world', name: 'MB World Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Ethnic world instruments', author: 'Max Booster', grade: 'A', oscillators: [], envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.5 }, parameters: [{ id: 'region', name: 'Region', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'expression', name: 'Expression', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { region: 0.5, expression: 0.7, volume: 0.8 } };

export default MbSamplerWorldPlugin;
