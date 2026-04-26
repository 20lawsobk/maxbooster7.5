import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbAmbientPlugin: PluginDefinition = { id: 'mb-reverb-ambient', slug: 'mb-reverb-ambient', name: 'MB Ambient Verb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Ethereal ambient reverb', author: 'Max Booster', grade: 'A', parameters: [{ id: 'space', name: 'Space', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 8.0, minValue: 2, maxValue: 30, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { space: 0.9, decay: 8.0, mix: 0.5 } };

export default MbReverbAmbientPlugin;
