import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmBellPlugin: PluginDefinition = { id: 'mb-fm-bell', slug: 'mb-fm-bell', name: 'MB FM Bell', category: 'instrument', type: 'fm', version: '1.0.0', description: 'Crystalline FM bells', author: 'Max Booster', grade: 'A', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.001, decay: 1.5, sustain: 0.2, release: 1.0 }, parameters: [{ id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 3.5, minValue: 1, maxValue: 8, automatable: true }, { id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 5, minValue: 0, maxValue: 20, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { ratio: 3.5, modIndex: 5, volume: 0.7 } };

export default MbFmBellPlugin;
