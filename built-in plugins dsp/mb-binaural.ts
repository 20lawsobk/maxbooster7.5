import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBinauralPlugin: PluginDefinition = { id: 'mb-binaural', slug: 'mb-binaural', name: 'MB Binaural Processor', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'HRTF-based binaural spatialization for headphone monitoring', author: 'Max Booster', parameters: [{ id: 'angle', name: 'Angle', type: 'float', defaultValue: 0, minValue: -180, maxValue: 180, automatable: true }, { id: 'distance', name: 'Distance', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 5, automatable: true }, { id: 'headSize', name: 'Head Size', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { angle: 0, distance: 1, headSize: 0.5, mix: 1 } };

export default MbBinauralPlugin;
