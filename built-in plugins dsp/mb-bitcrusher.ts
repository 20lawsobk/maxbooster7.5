import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBitcrusherPlugin: PluginDefinition = {
    id: 'mb-bitcrusher',
    slug: 'mb-bitcrusher',
    name: 'MB Bitcrusher',
    category: 'effect',
    type: 'distortion',
    version: '1.0.0',
    description: 'Bit reduction and sample rate destruction for lo-fi effects',
    author: 'Max Booster',
    parameters: [
      { id: 'bit_depth', name: 'Bit Depth', type: 'float', defaultValue: 16, minValue: 1, maxValue: 16, automatable: true },
      { id: 'sample_rate', name: 'Sample Rate', type: 'float', defaultValue: 44100, minValue: 100, maxValue: 44100, unit: 'Hz', automatable: true },
      { id: 'jitter', name: 'Jitter', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true },
      { id: 'dither', name: 'Dither', type: 'bool', defaultValue: false, automatable: false },
      { id: 'drive', name: 'Drive', type: 'float', defaultValue: 0, minValue: 0, maxValue: 24, unit: 'dB', automatable: true },
      { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { bit_depth: 16, sample_rate: 44100, jitter: 0, dither: false, drive: 0, mix: 1 },
  };

export default MbBitcrusherPlugin;
