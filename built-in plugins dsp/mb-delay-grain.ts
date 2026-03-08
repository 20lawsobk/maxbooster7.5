import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDelayGrainPlugin: PluginDefinition = { id: 'mb-delay-grain', slug: 'mb-delay-grain', name: 'MB Grain Delay', category: 'effect', type: 'delay', version: '1.0.0', description: 'Granular pitch delay', author: 'Max Booster', parameters: [{ id: 'size', name: 'Grain Size', type: 'float', defaultValue: 100, minValue: 10, maxValue: 500, automatable: true }, { id: 'pitch', name: 'Pitch', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 0.9, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 100, pitch: 0, feedback: 0.4, mix: 0.35 } };

export default MbDelayGrainPlugin;
