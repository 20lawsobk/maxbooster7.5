import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVocalCompPlugin: PluginDefinition = { id: 'mb-vocal-comp', slug: 'mb-vocal-comp', name: 'MB Vocal Compressor', category: 'effect', type: 'vocal', version: '1.0.0', description: 'Optimized vocal dynamics', author: 'Max Booster', grade: 'A', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -18, minValue: -60, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 4, minValue: 1, maxValue: 20, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 5, minValue: 0.1, maxValue: 50, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 80, minValue: 10, maxValue: 500, automatable: true }], defaultPreset: { threshold: -18, ratio: 4, attack: 5, release: 80 } };

export default MbVocalCompPlugin;
