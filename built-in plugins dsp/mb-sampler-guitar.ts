import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerGuitarPlugin: PluginDefinition = { id: 'mb-sampler-guitar', slug: 'mb-sampler-guitar', name: 'MB Guitar Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Acoustic and electric guitars', author: 'Max Booster', oscillators: [], envelope: { attack: 0.005, decay: 0.5, sustain: 0.5, release: 0.4 }, parameters: [{ id: 'type', name: 'Type', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'pick', name: 'Pick Position', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { type: 0.5, pick: 0.5, volume: 0.8 } };

export default MbSamplerGuitarPlugin;
