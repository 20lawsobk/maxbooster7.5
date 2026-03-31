import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCreativeFreqshiftPlugin: PluginDefinition = { id: 'mb-creative-freqshift', slug: 'mb-creative-freqshift', name: 'MB Frequency Shifter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Linear frequency shifting for metallic and inharmonic effects', author: 'Max Booster', parameters: [{ id: 'shift', name: 'Shift', type: 'float', defaultValue: 0, minValue: -2000, maxValue: 2000, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0, minValue: 0, maxValue: 0.9, automatable: true }, { id: 'direction', name: 'Direction', type: 'float', defaultValue: 0, minValue: 0, maxValue: 2, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { shift: 0, feedback: 0, direction: 0, mix: 1 } };

export default MbCreativeFreqshiftPlugin;
