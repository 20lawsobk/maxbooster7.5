import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerSynthPlugin: PluginDefinition = { id: 'mb-sampler-synth', slug: 'mb-sampler-synth', name: 'MB Synth Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Classic synth samples', author: 'Max Booster', grade: 'A', oscillators: [], envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.4 }, parameters: [{ id: 'era', name: 'Era', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'filter', name: 'Filter', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { era: 0.5, filter: 0.6, volume: 0.8 } };

export default MbSamplerSynthPlugin;
