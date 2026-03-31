import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVocalDebreathPlugin: PluginDefinition = { id: 'mb-vocal-debreath', slug: 'mb-vocal-debreath', name: 'MB De-Breath', category: 'effect', type: 'vocal', version: '1.0.0', description: 'Breath noise reduction', author: 'Max Booster', parameters: [{ id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: -12, minValue: -40, maxValue: 0, automatable: true }], defaultPreset: { sensitivity: 0.5, reduction: -12 } };

export default MbVocalDebreathPlugin;
