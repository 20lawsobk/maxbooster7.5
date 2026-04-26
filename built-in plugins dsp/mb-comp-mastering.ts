import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCompMasteringPlugin: PluginDefinition = { id: 'mb-comp-mastering', slug: 'mb-comp-mastering', name: 'MB Mastering Comp', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Transparent mastering compressor', author: 'Max Booster', grade: 'A', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -8, minValue: -30, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 1.5, minValue: 1, maxValue: 4, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 20, minValue: 1, maxValue: 100, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 250, minValue: 50, maxValue: 1000, automatable: true }], defaultPreset: { threshold: -8, ratio: 1.5, attack: 20, release: 250 } };

export default MbCompMasteringPlugin;
