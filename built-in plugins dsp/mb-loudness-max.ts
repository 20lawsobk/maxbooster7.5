import type { PluginDefinition } from '../server/services/pluginHostService';

const MbLoudnessMaxPlugin: PluginDefinition = { id: 'mb-loudness-max', slug: 'mb-loudness-max', name: 'MB Loudness Maximizer', category: 'effect', type: 'limiter' as any, version: '1.0.0', description: 'Intelligent loudness maximizer with LUFS targeting', author: 'Max Booster', grade: 'A', parameters: [{ id: 'target', name: 'Target LUFS', type: 'float', defaultValue: -14, minValue: -24, maxValue: -6, automatable: true }, { id: 'ceiling', name: 'Ceiling', type: 'float', defaultValue: -0.3, minValue: -3, maxValue: 0, automatable: true }, { id: 'speed', name: 'Speed', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'character', name: 'Character', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { target: -14, ceiling: -0.3, speed: 0.5, character: 0.5 } };

export default MbLoudnessMaxPlugin;
