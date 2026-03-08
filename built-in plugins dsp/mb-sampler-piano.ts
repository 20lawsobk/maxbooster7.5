import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerPianoPlugin: PluginDefinition = { id: 'mb-sampler-piano', slug: 'mb-sampler-piano', name: 'MB Piano Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Multi-sampled grand piano', author: 'Max Booster', oscillators: [], envelope: { attack: 0.001, decay: 0.5, sustain: 0.8, release: 0.5 }, parameters: [{ id: 'velocity', name: 'Velocity', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 5, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { velocity: 0.8, release: 0.5, volume: 0.8 } };

export default MbSamplerPianoPlugin;
