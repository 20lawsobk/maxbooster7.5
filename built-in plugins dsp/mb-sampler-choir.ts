import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerChoirPlugin: PluginDefinition = { id: 'mb-sampler-choir', slug: 'mb-sampler-choir', name: 'MB Choir Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Cathedral choir samples', author: 'Max Booster', grade: 'A', oscillators: [], envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1.0 }, parameters: [{ id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'vibrato', name: 'Vibrato', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { vowel: 0.5, vibrato: 0.4, volume: 0.75 } };

export default MbSamplerChoirPlugin;
