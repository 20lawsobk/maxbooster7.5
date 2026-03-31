import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeReversePlugin: PluginDefinition = { id: 'mb-time-reverse', slug: 'mb-time-reverse', name: 'MB Reverse Effect', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Real-time audio reversal with crossfade control', author: 'Max Booster', parameters: [{ id: 'windowSize', name: 'Window Size', type: 'float', defaultValue: 200, minValue: 50, maxValue: 2000, automatable: true }, { id: 'crossfade', name: 'Crossfade', type: 'float', defaultValue: 0.1, minValue: 0, maxValue: 0.5, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { windowSize: 200, crossfade: 0.1, mix: 0.5 } };

export default MbTimeReversePlugin;
