import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDeesserPlugin: PluginDefinition = { id: 'mb-deesser', slug: 'mb-deesser', name: 'MB De-Esser', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Sibilance reduction', author: 'Max Booster', parameters: [{ id: 'freq', name: 'Frequency', type: 'float', defaultValue: 6000, minValue: 3000, maxValue: 12000, automatable: true }, { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -20, minValue: -60, maxValue: 0, automatable: true }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 6, minValue: 0, maxValue: 24, automatable: true }], defaultPreset: { freq: 6000, threshold: -20, reduction: 6 } };

export default MbDeesserPlugin;
