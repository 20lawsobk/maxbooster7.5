import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDistBitcrushPlugin: PluginDefinition = { id: 'mb-dist-bitcrush', slug: 'mb-dist-bitcrush', name: 'MB Bitcrusher', category: 'effect', type: 'distortion', version: '1.0.0', description: 'Lo-fi bit reduction', author: 'Max Booster', parameters: [{ id: 'bits', name: 'Bits', type: 'float', defaultValue: 8, minValue: 1, maxValue: 16, automatable: true }, { id: 'rate', name: 'Sample Rate', type: 'float', defaultValue: 22050, minValue: 1000, maxValue: 44100, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { bits: 8, rate: 22050, mix: 1 } };

export default MbDistBitcrushPlugin;
