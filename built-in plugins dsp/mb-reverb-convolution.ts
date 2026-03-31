import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbConvolutionPlugin: PluginDefinition = { id: 'mb-reverb-convolution', slug: 'mb-reverb-convolution', name: 'MB Convolution', category: 'effect', type: 'reverb', version: '1.0.0', description: 'IR convolution reverb', author: 'Max Booster', parameters: [{ id: 'ir', name: 'Impulse', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'predelay', name: 'Pre-delay', type: 'float', defaultValue: 20, minValue: 0, maxValue: 200, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { ir: 0.5, predelay: 20, mix: 0.3 } };

export default MbReverbConvolutionPlugin;
