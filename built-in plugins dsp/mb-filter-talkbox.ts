import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFilterTalkboxPlugin: PluginDefinition = { id: 'mb-filter-talkbox', slug: 'mb-filter-talkbox', name: 'MB Talk Box', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Talk box effect simulating speech-like filter modulation', author: 'Max Booster', parameters: [{ id: 'vowelA', name: 'Vowel A', type: 'float', defaultValue: 0, minValue: 0, maxValue: 4, automatable: true }, { id: 'vowelB', name: 'Vowel B', type: 'float', defaultValue: 2, minValue: 0, maxValue: 4, automatable: true }, { id: 'morph', name: 'Morph', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { vowelA: 0, vowelB: 2, morph: 0.5, mix: 1 } };

export default MbFilterTalkboxPlugin;
