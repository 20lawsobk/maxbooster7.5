import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPingPongDelayPlugin: PluginDefinition = {
    id: 'mb-ping-pong-delay',
    slug: 'mb-ping-pong-delay',
    name: 'MB Ping Pong Delay',
    category: 'effect',
    type: 'delay',
    version: '1.0.0',
    description: 'Stereo ping pong delay with tempo sync',
    author: 'Max Booster', grade: 'A',
    parameters: [
      { id: 'time_l', name: 'Time Left', type: 'float', defaultValue: 250, minValue: 1, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'time_r', name: 'Time Right', type: 'float', defaultValue: 375, minValue: 1, maxValue: 2000, unit: 'ms', automatable: true },
      { id: 'sync', name: 'Tempo Sync', type: 'bool', defaultValue: true, automatable: false },
      { id: 'sync_l', name: 'Sync Left', type: 'choice', defaultValue: '1/4', choices: ['1/16', '1/8', '1/4', '1/2', '1/1', '3/16', '3/8'], automatable: false },
      { id: 'sync_r', name: 'Sync Right', type: 'choice', defaultValue: '1/4D', choices: ['1/16', '1/8', '1/4', '1/2', '1/1', '1/4D', '1/8D'], automatable: false },
      { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 0.95, automatable: true },
      { id: 'cross_feedback', name: 'Cross Feedback', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 0.95, automatable: true },
      { id: 'low_cut', name: 'Low Cut', type: 'float', defaultValue: 100, minValue: 20, maxValue: 2000, unit: 'Hz', automatable: true },
      { id: 'high_cut', name: 'High Cut', type: 'float', defaultValue: 8000, minValue: 500, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { time_l: 250, time_r: 375, sync: true, sync_l: '1/4', sync_r: '1/4D', feedback: 0.4, cross_feedback: 0.3, low_cut: 100, high_cut: 8000, mix: 0.3 },
  };

export default MbPingPongDelayPlugin;
