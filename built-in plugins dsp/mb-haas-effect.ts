import type { PluginDefinition } from '../server/services/pluginHostService';

const MbHaasEffectPlugin: PluginDefinition = { id: 'mb-haas-effect', slug: 'mb-haas-effect', name: 'MB Haas Effect', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'Precedence effect stereo widening using micro delays', author: 'Max Booster', parameters: [{ id: 'delay', name: 'Delay', type: 'float', defaultValue: 15, minValue: 1, maxValue: 40, automatable: true }, { id: 'channel', name: 'Channel', type: 'float', defaultValue: 0, minValue: -1, maxValue: 1, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0, minValue: 0, maxValue: 0.5, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { delay: 15, channel: 0, feedback: 0, mix: 1 } };

export default MbHaasEffectPlugin;
