import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSamplerDrumsPlugin: PluginDefinition = { id: 'mb-sampler-drums', slug: 'mb-sampler-drums', name: 'MB Drum Sampler', category: 'instrument', type: 'sampler', version: '1.0.0', description: 'Multi-layer drum samples', author: 'Max Booster', oscillators: [], envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 }, parameters: [{ id: 'kit', name: 'Kit', type: 'float', defaultValue: 1, minValue: 1, maxValue: 8, automatable: false }, { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { kit: 1, punch: 0.7, volume: 0.85 } };

export default MbSamplerDrumsPlugin;
