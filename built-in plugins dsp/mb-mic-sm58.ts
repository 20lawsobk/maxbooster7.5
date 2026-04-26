import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMicSm58Plugin: PluginDefinition = { id: 'mb-mic-sm58', slug: 'mb-mic-sm58', name: 'MB SM58 Modeler', category: 'effect', type: 'microphone', version: '1.0.0', description: 'Shure SM58 stage mic', author: 'Max Booster', grade: 'A', parameters: [{ id: 'presence', name: 'Presence', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'proximity', name: 'Proximity', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { presence: 0.5, proximity: 0.4 } };

export default MbMicSm58Plugin;
