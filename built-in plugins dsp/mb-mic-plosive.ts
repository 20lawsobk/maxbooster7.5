import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMicPlosivePlugin: PluginDefinition = { id: 'mb-mic-plosive', slug: 'mb-mic-plosive', name: 'MB Plosive Reducer', category: 'effect', type: 'microphone', version: '1.0.0', description: 'Pops and plosive control', author: 'Max Booster', grade: 'A', parameters: [{ id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'freq', name: 'Frequency', type: 'float', defaultValue: 120, minValue: 50, maxValue: 300, automatable: true }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 12, minValue: 0, maxValue: 24, automatable: true }], defaultPreset: { sensitivity: 0.5, freq: 120, reduction: 12 } };

export default MbMicPlosivePlugin;
