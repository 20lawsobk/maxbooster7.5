import type { PluginDefinition } from '../server/services/pluginHostService';

const MbLoudnessPlugin: PluginDefinition = { id: 'mb-loudness', slug: 'mb-loudness', name: 'MB Loudness Meter', category: 'effect', type: 'limiter', version: '1.0.0', description: 'LUFS loudness metering', author: 'Max Booster', grade: 'A', parameters: [{ id: 'target', name: 'Target LUFS', type: 'float', defaultValue: -14, minValue: -24, maxValue: -6, automatable: false }], defaultPreset: { target: -14 } };

export default MbLoudnessPlugin;
