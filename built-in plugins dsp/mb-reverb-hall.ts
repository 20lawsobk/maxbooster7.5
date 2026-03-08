import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbHallPlugin: PluginDefinition = { id: 'mb-reverb-hall', slug: 'mb-reverb-hall', name: 'MB Hall Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Large concert hall reverb', author: 'Max Booster', parameters: [{ id: 'size', name: 'Size', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 3.0, minValue: 0.5, maxValue: 10, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 0.8, decay: 3.0, mix: 0.3 } };

export default MbReverbHallPlugin;
