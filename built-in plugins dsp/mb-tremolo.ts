import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTremoloPlugin: PluginDefinition = { id: 'mb-tremolo', slug: 'mb-tremolo', name: 'MB Tremolo', category: 'effect', type: 'chorus', version: '1.0.0', description: 'Amplitude modulation', author: 'Max Booster', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 4, minValue: 0.5, maxValue: 20, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'shape', name: 'Shape', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 4, depth: 0.5, shape: 0.5 } };

export default MbTremoloPlugin;
