import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmBassPlugin: PluginDefinition = { id: 'mb-fm-bass', slug: 'mb-fm-bass', name: 'MB FM Bass', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Punchy FM bass', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.9 }], envelope: { attack: 0.001, decay: 0.2, sustain: 0.6, release: 0.15 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 4, minValue: 0, maxValue: 15, automatable: true }, { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.85, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 4, punch: 0.7, volume: 0.85 } };

export default MbFmBassPlugin;
