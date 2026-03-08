import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVibratoPlugin: PluginDefinition = { id: 'mb-vibrato', slug: 'mb-vibrato', name: 'MB Vibrato', category: 'effect', type: 'chorus', version: '1.0.0', description: 'Pitch modulation', author: 'Max Booster', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 5, minValue: 1, maxValue: 15, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 5, depth: 0.3 } };

export default MbVibratoPlugin;
