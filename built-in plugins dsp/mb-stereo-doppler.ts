import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStereoDopplerPlugin: PluginDefinition = { id: 'mb-stereo-doppler', slug: 'mb-stereo-doppler', name: 'MB Doppler Effect', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'Realistic Doppler shift simulation for moving sound sources', author: 'Max Booster', parameters: [{ id: 'speed', name: 'Speed', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'distance', name: 'Distance', type: 'float', defaultValue: 5, minValue: 1, maxValue: 50, automatable: true }, { id: 'path', name: 'Path', type: 'float', defaultValue: 0, minValue: 0, maxValue: 3, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { speed: 0.5, distance: 5, path: 0, mix: 1 } };

export default MbStereoDopplerPlugin;
