import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDelayTapePlugin: PluginDefinition = { id: 'mb-delay-tape', slug: 'mb-delay-tape', name: 'MB Tape Delay', category: 'effect', type: 'delay', version: '1.0.0', description: 'Warm tape echo', author: 'Max Booster', grade: 'A', parameters: [{ id: 'time', name: 'Time', type: 'float', defaultValue: 300, minValue: 50, maxValue: 1500, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.45, minValue: 0, maxValue: 0.9, automatable: true }, { id: 'saturation', name: 'Saturation', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { time: 300, feedback: 0.45, saturation: 0.4, mix: 0.3 } };

export default MbDelayTapePlugin;
