import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbPlatePlugin: PluginDefinition = { id: 'mb-reverb-plate', slug: 'mb-reverb-plate', name: 'MB Plate Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Classic plate reverb', author: 'Max Booster', grade: 'A', parameters: [{ id: 'size', name: 'Size', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 2.0, minValue: 0.5, maxValue: 6, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.35, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 0.6, decay: 2.0, mix: 0.35 } };

export default MbReverbPlatePlugin;
