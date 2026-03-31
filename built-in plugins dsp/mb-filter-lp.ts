import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterLpPlugin: PluginDefinition = { id: 'mb-filter-lp', slug: 'mb-filter-lp', name: 'MB Low-Pass Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Resonant low-pass filter with multiple slope options', author: 'Max Booster', parameters: [{ id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 5000, minValue: 20, maxValue: 20000, automatable: true }, { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'slope', name: 'Slope', type: 'float', defaultValue: 12, minValue: 6, maxValue: 48, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { cutoff: 5000, resonance: 0.3, slope: 12, mix: 1 } };

export default MbFilterLpPlugin;
