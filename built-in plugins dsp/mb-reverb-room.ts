import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbRoomPlugin: PluginDefinition = { id: 'mb-reverb-room', slug: 'mb-reverb-room', name: 'MB Room Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Natural room ambience', author: 'Max Booster', parameters: [{ id: 'size', name: 'Size', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 1.2, minValue: 0.2, maxValue: 4, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.25, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 0.4, decay: 1.2, mix: 0.25 } };

export default MbReverbRoomPlugin;
