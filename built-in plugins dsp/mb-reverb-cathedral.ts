import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbCathedralPlugin: PluginDefinition = { id: 'mb-reverb-cathedral', slug: 'mb-reverb-cathedral', name: 'MB Cathedral', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Massive cathedral space', author: 'Max Booster', parameters: [{ id: 'size', name: 'Size', type: 'float', defaultValue: 1.0, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 6.0, minValue: 2, maxValue: 20, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 1.0, decay: 6.0, mix: 0.35 } };

export default MbReverbCathedralPlugin;
