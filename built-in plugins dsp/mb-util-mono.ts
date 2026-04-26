import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilMonoPlugin: PluginDefinition = { id: 'mb-util-mono', slug: 'mb-util-mono', name: 'MB Mono Sum', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Stereo to mono summing with channel selection', author: 'Max Booster', grade: 'A', parameters: [{ id: 'mode', name: 'Mode', type: 'float', defaultValue: 0, minValue: 0, maxValue: 3, automatable: false }, { id: 'balance', name: 'L/R Balance', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { mode: 0, balance: 0.5 } };

export default MbUtilMonoPlugin;
