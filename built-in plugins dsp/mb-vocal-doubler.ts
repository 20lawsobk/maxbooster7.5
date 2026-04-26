import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVocalDoublerPlugin: PluginDefinition = { id: 'mb-vocal-doubler', slug: 'mb-vocal-doubler', name: 'MB Vocal Doubler', category: 'effect', type: 'vocal', version: '1.0.0', description: 'Natural vocal doubling effect', author: 'Max Booster', grade: 'A', parameters: [{ id: 'voices', name: 'Voices', type: 'float', defaultValue: 2, minValue: 1, maxValue: 4, automatable: false }, { id: 'timing', name: 'Timing', type: 'float', defaultValue: 20, minValue: 5, maxValue: 100, automatable: true }, { id: 'pitch', name: 'Pitch Var', type: 'float', defaultValue: 5, minValue: 0, maxValue: 30, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { voices: 2, timing: 20, pitch: 5, mix: 0.4 } };

export default MbVocalDoublerPlugin;
