import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerWoodwindPlugin: PluginDefinition = { id: 'mb-sampler-woodwind', slug: 'mb-sampler-woodwind', name: 'MB Woodwind Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Orchestral woodwinds', author: 'Max Booster', grade: 'A', oscillators: [], envelope: { attack: 0.08, decay: 0.4, sustain: 0.7, release: 0.4 }, parameters: [{ id: 'instrument', name: 'Instrument', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'breath', name: 'Breath', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { instrument: 0.5, breath: 0.5, volume: 0.75 } };

export default MbSamplerWoodwindPlugin;
