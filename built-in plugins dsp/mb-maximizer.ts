import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMaximizerPlugin: PluginDefinition = { id: 'mb-maximizer', slug: 'mb-maximizer', name: 'MB Maximizer', category: 'effect', type: 'limiter', version: '1.0.0', description: 'Loudness maximizer', author: 'Max Booster', grade: 'A', parameters: [{ id: 'ceiling', name: 'Ceiling', type: 'float', defaultValue: -0.3, minValue: -3, maxValue: 0, automatable: true }, { id: 'gain', name: 'Gain', type: 'float', defaultValue: 6, minValue: 0, maxValue: 24, automatable: true }], defaultPreset: { ceiling: -0.3, gain: 6 } };

export default MbMaximizerPlugin;
