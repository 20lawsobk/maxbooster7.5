import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterBpPlugin: PluginDefinition = { id: 'mb-filter-bp', slug: 'mb-filter-bp', name: 'MB Band-Pass Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Band-pass filter for isolating frequency ranges', author: 'Max Booster', grade: 'A', parameters: [{ id: 'center', name: 'Center Freq', type: 'float', defaultValue: 1000, minValue: 20, maxValue: 20000, automatable: true }, { id: 'bandwidth', name: 'Bandwidth', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 10, automatable: true }, { id: 'gain', name: 'Gain', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { center: 1000, bandwidth: 1, gain: 0, mix: 1 } };

export default MbFilterBpPlugin;
