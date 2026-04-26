import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCompTransientPlugin: PluginDefinition = { id: 'mb-comp-transient', slug: 'mb-comp-transient', name: 'MB Transient Shaper', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Attack and sustain shaper', author: 'Max Booster', grade: 'A', parameters: [{ id: 'attack', name: 'Attack', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, automatable: true }, { id: 'sustain', name: 'Sustain', type: 'float', defaultValue: 0, minValue: -100, maxValue: 100, automatable: true }], defaultPreset: { attack: 0, sustain: 0 } };

export default MbCompTransientPlugin;
