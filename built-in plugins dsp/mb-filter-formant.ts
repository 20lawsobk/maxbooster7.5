import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterFormantPlugin: PluginDefinition = { id: 'mb-filter-formant', slug: 'mb-filter-formant', name: 'MB Formant Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Vowel formant filter for vocal-like resonance effects', author: 'Max Booster', grade: 'A', parameters: [{ id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'morph', name: 'Morph', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { vowel: 0.5, morph: 0, resonance: 0.5, mix: 1 } };

export default MbFilterFormantPlugin;
