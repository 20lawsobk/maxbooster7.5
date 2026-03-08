import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDelayAnalogPlugin: PluginDefinition = { id: 'mb-delay-analog', slug: 'mb-delay-analog', name: 'MB Analog Delay', category: 'effect', type: 'delay', version: '1.0.0', description: 'BBD-style analog delay', author: 'Max Booster', parameters: [{ id: 'time', name: 'Time', type: 'float', defaultValue: 200, minValue: 20, maxValue: 800, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 0.9, automatable: true }, { id: 'color', name: 'Color', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { time: 200, feedback: 0.5, color: 0.5, mix: 0.35 } };

export default MbDelayAnalogPlugin;
