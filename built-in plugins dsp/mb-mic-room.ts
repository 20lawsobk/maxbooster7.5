import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMicRoomPlugin: PluginDefinition = { id: 'mb-mic-room', slug: 'mb-mic-room', name: 'MB Room Simulator', category: 'effect', type: 'microphone', version: '1.0.0', description: 'Recording room emulation', author: 'Max Booster', grade: 'A', parameters: [{ id: 'size', name: 'Room Size', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'distance', name: 'Distance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'reflection', name: 'Reflections', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 0.4, distance: 0.3, reflection: 0.5 } };

export default MbMicRoomPlugin;
