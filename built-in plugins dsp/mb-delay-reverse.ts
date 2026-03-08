import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDelayReversePlugin: PluginDefinition = { id: 'mb-delay-reverse', slug: 'mb-delay-reverse', name: 'MB Reverse Delay', category: 'effect', type: 'delay', version: '1.0.0', description: 'Backwards reverse delay', author: 'Max Booster', parameters: [{ id: 'time', name: 'Time', type: 'float', defaultValue: 400, minValue: 100, maxValue: 1000, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 0.85, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { time: 400, feedback: 0.4, mix: 0.35 } };

export default MbDelayReversePlugin;
