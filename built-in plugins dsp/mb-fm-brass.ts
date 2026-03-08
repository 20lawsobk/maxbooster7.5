import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmBrassPlugin: PluginDefinition = { id: 'mb-fm-brass', slug: 'mb-fm-brass', name: 'MB FM Brass', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Bright FM brass', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.8 }], envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.3 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 6, minValue: 0, maxValue: 20, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 6, brightness: 0.7, volume: 0.8 } };

export default MbFmBrassPlugin;
