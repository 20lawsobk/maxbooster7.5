import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqParametricPlugin: PluginDefinition = { id: 'mb-eq-parametric', slug: 'mb-eq-parametric', name: 'MB Parametric EQ', category: 'effect', type: 'eq', version: '1.0.0', description: '4-band parametric EQ', author: 'Max Booster', parameters: [{ id: 'lowFreq', name: 'Low Freq', type: 'float', defaultValue: 80, minValue: 20, maxValue: 500, automatable: true }, { id: 'lowGain', name: 'Low Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, automatable: true }, { id: 'highFreq', name: 'High Freq', type: 'float', defaultValue: 8000, minValue: 2000, maxValue: 20000, automatable: true }, { id: 'highGain', name: 'High Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, automatable: true }], defaultPreset: { lowFreq: 80, lowGain: 0, highFreq: 8000, highGain: 0 } };

export default MbEqParametricPlugin;
