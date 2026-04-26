import type { PluginDefinition } from '../server/services/pluginHostService';

const MbFlangerJetPlugin: PluginDefinition = { id: 'mb-flanger-jet', slug: 'mb-flanger-jet', name: 'MB Jet Flanger', category: 'effect', type: 'flanger', version: '1.0.0', description: 'Jet airplane flanging', author: 'Max Booster', grade: 'A', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 0.3, minValue: 0.01, maxValue: 5, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 0.99, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 0.3, depth: 0.8, feedback: 0.7, mix: 0.5 } };

export default MbFlangerJetPlugin;
