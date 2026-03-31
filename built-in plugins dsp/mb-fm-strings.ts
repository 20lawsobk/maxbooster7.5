import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFmStringsPlugin: PluginDefinition = { id: 'mb-fm-strings', slug: 'mb-fm-strings', name: 'MB FM Strings', category: 'instrument', type: 'fm', version: '1.0.0', description: 'FM string ensemble', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.3, decay: 0.5, sustain: 0.8, release: 0.8 }, parameters: [{ id: 'modIndex', name: 'Mod Index', type: 'float', defaultValue: 1.5, minValue: 0, maxValue: 8, automatable: true }, { id: 'ensemble', name: 'Ensemble', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { modIndex: 1.5, ensemble: 0.6, volume: 0.75 } };

export default MbFmStringsPlugin;
