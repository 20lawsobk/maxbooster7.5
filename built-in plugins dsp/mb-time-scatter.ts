import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeScatterPlugin: PluginDefinition = { id: 'mb-time-scatter', slug: 'mb-time-scatter', name: 'MB Scatter', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Tempo-synced audio scatter with randomized playback order', author: 'Max Booster', parameters: [{ id: 'division', name: 'Division', type: 'float', defaultValue: 8, minValue: 2, maxValue: 32, automatable: false }, { id: 'probability', name: 'Probability', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'reverse', name: 'Reverse', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { division: 8, probability: 0.3, reverse: 0.2, mix: 0.5 } };

export default MbTimeScatterPlugin;
