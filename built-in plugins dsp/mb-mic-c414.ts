import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMicC414Plugin: PluginDefinition = { id: 'mb-mic-c414', slug: 'mb-mic-c414', name: 'MB C414 Modeler', category: 'effect', type: 'microphone', version: '1.0.0', description: 'AKG C414 emulation', author: 'Max Booster', parameters: [{ id: 'pattern', name: 'Pattern', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'proximity', name: 'Proximity', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { pattern: 0.5, brightness: 0.6, proximity: 0.3 } };

export default MbMicC414Plugin;
