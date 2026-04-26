import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDelayPingpongPlugin: PluginDefinition = { id: 'mb-delay-pingpong', slug: 'mb-delay-pingpong', name: 'MB Ping Pong', category: 'effect', type: 'delay', version: '1.0.0', description: 'Bouncing ping pong delay', author: 'Max Booster', grade: 'A', parameters: [{ id: 'time', name: 'Time', type: 'float', defaultValue: 375, minValue: 1, maxValue: 2000, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 0.95, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { time: 375, feedback: 0.5, mix: 0.35 } };

export default MbDelayPingpongPlugin;
