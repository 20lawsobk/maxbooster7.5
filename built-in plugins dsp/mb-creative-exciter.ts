import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCreativeExciterPlugin: PluginDefinition = { id: 'mb-creative-exciter', slug: 'mb-creative-exciter', name: 'MB Aural Exciter', category: 'effect', type: 'distortion' as any, version: '1.0.0', description: 'Classic aural exciter for adding sparkle and air', author: 'Max Booster', parameters: [{ id: 'frequency', name: 'Tune', type: 'float', defaultValue: 3000, minValue: 500, maxValue: 10000, automatable: true }, { id: 'harmonics', name: 'Harmonics', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'timbre', name: 'Timbre', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { frequency: 3000, harmonics: 0.4, timbre: 0.5, mix: 0.3 } };

export default MbCreativeExciterPlugin;
