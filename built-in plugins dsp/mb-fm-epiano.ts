import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmEpianoPlugin: PluginDefinition = { id: 'mb-fm-epiano', slug: 'mb-fm-epiano', name: 'MB FM E-Piano', category: 'instrument', type: 'fm', version: '1.0.0', description: 'FM electric piano tines', author: 'Max Booster', grade: 'A', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.001, decay: 0.8, sustain: 0.3, release: 0.5 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 2.5, minValue: 0, maxValue: 15, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 2.5, brightness: 0.6, volume: 0.8 } };

export default MbFmEpianoPlugin;
