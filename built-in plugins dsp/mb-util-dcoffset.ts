import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilDcoffsetPlugin: PluginDefinition = { id: 'mb-util-dcoffset', slug: 'mb-util-dcoffset', name: 'MB DC Offset Remover', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Remove DC offset from audio signal', author: 'Max Booster', grade: 'A', parameters: [{ id: 'frequency', name: 'HP Frequency', type: 'float', defaultValue: 5, minValue: 1, maxValue: 30, automatable: false }, { id: 'autoDetect', name: 'Auto Detect', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { frequency: 5, autoDetect: 1 } };

export default MbUtilDcoffsetPlugin;
