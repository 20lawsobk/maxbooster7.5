import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbGatedPlugin: PluginDefinition = { id: 'mb-reverb-gated', slug: 'mb-reverb-gated', name: 'MB Gated Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: '80s gated reverb', author: 'Max Booster', grade: 'A', parameters: [{ id: 'gate', name: 'Gate Time', type: 'float', defaultValue: 0.3, minValue: 0.1, maxValue: 1, automatable: true }, { id: 'size', name: 'Size', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { gate: 0.3, size: 0.7, mix: 0.4 } };

export default MbReverbGatedPlugin;
