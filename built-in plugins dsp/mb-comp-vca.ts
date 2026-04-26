import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCompVcaPlugin: PluginDefinition = { id: 'mb-comp-vca', slug: 'mb-comp-vca', name: 'MB VCA Comp', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Fast VCA compressor', author: 'Max Booster', grade: 'A', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -18, minValue: -60, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 6, minValue: 1, maxValue: 20, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 50, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 50, minValue: 5, maxValue: 500, automatable: true }], defaultPreset: { threshold: -18, ratio: 6, attack: 1, release: 50 } };

export default MbCompVcaPlugin;
