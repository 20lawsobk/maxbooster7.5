import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerBrassPlugin: PluginDefinition = { id: 'mb-sampler-brass', slug: 'mb-sampler-brass', name: 'MB Brass Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Orchestral brass ensemble', author: 'Max Booster', grade: 'A', oscillators: [], envelope: { attack: 0.05, decay: 0.3, sustain: 0.75, release: 0.3 }, parameters: [{ id: 'section', name: 'Section', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'dynamics', name: 'Dynamics', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { section: 0.5, dynamics: 0.7, volume: 0.8 } };

export default MbSamplerBrassPlugin;
