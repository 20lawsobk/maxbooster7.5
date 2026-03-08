import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmLeadPlugin: PluginDefinition = { id: 'mb-fm-lead', slug: 'mb-fm-lead', name: 'MB FM Lead', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Cutting FM lead', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }], envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 7, minValue: 0, maxValue: 20, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 7, brightness: 0.8, volume: 0.8 } };

export default MbFmLeadPlugin;
