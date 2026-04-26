import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmOrganPlugin: PluginDefinition = { id: 'mb-fm-organ', slug: 'mb-fm-organ', name: 'MB FM Organ', category: 'instrument', type: 'fm', version: '1.0.0', description: 'FM drawbar organ', author: 'Max Booster', grade: 'A', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 2, minValue: 0, maxValue: 10, automatable: true }, { id: 'percussive', name: 'Percussive', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 2, percussive: 0.5, volume: 0.8 } };

export default MbFmOrganPlugin;
