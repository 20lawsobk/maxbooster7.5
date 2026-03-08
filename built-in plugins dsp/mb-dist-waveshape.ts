import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDistWaveshapePlugin: PluginDefinition = { id: 'mb-dist-waveshape', slug: 'mb-dist-waveshape', name: 'MB Waveshaper', category: 'effect', type: 'distortion', version: '1.0.0', description: 'Custom waveshaping', author: 'Max Booster', parameters: [{ id: 'curve', name: 'Curve', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { curve: 0.5, drive: 0.5, mix: 1 } };

export default MbDistWaveshapePlugin;
