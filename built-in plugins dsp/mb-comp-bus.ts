import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCompBusPlugin: PluginDefinition = { id: 'mb-comp-bus', slug: 'mb-comp-bus', name: 'MB Bus Comp', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Mix bus glue compressor', author: 'Max Booster', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -12, minValue: -40, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 2, minValue: 1, maxValue: 8, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 30, minValue: 0.1, maxValue: 100, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 300, minValue: 50, maxValue: 1000, automatable: true }], defaultPreset: { threshold: -12, ratio: 2, attack: 30, release: 300 } };

export default MbCompBusPlugin;
