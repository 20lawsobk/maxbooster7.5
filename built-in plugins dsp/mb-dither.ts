import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDitherPlugin: PluginDefinition = { id: 'mb-dither', slug: 'mb-dither', name: 'MB Dithering', category: 'effect', type: 'mastering' as any, version: '1.0.0', description: 'High-quality dithering with noise shaping for bit depth reduction', author: 'Max Booster', parameters: [{ id: 'bitDepth', name: 'Bit Depth', type: 'float', defaultValue: 16, minValue: 8, maxValue: 24, automatable: false }, { id: 'noiseShape', name: 'Noise Shaping', type: 'float', defaultValue: 1, minValue: 0, maxValue: 3, automatable: false }, { id: 'ditherType', name: 'Dither Type', type: 'float', defaultValue: 1, minValue: 0, maxValue: 2, automatable: false }], defaultPreset: { bitDepth: 16, noiseShape: 1, ditherType: 1 } };

export default MbDitherPlugin;
