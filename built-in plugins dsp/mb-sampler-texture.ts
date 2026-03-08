import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerTexturePlugin: PluginDefinition = { id: 'mb-sampler-texture', slug: 'mb-sampler-texture', name: 'MB Texture Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Ambient textures and soundscapes', author: 'Max Booster', oscillators: [], envelope: { attack: 1.0, decay: 1.0, sustain: 0.9, release: 2.0 }, parameters: [{ id: 'texture', name: 'Texture', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'space', name: 'Space', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { texture: 0.5, space: 0.7, volume: 0.7 } };

export default MbSamplerTexturePlugin;
