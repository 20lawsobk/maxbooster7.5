import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCompSidechainPlugin: PluginDefinition = { id: 'mb-comp-sidechain', slug: 'mb-comp-sidechain', name: 'MB Sidechain Comp', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Pumping sidechain compressor', author: 'Max Booster', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -30, minValue: -60, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 10, minValue: 1, maxValue: 20, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 20, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 150, minValue: 20, maxValue: 500, automatable: true }], defaultPreset: { threshold: -30, ratio: 10, attack: 1, release: 150 } };

export default MbCompSidechainPlugin;
