import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbSpringPlugin: PluginDefinition = { id: 'mb-reverb-spring', slug: 'mb-reverb-spring', name: 'MB Spring Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Vintage spring reverb', author: 'Max Booster', grade: 'A', parameters: [{ id: 'tension', name: 'Tension', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 1.5, minValue: 0.3, maxValue: 4, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { tension: 0.5, decay: 1.5, mix: 0.3 } };

export default MbReverbSpringPlugin;
