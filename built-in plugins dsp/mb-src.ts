import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSrcPlugin: PluginDefinition = { id: 'mb-src', slug: 'mb-src', name: 'MB Sample Rate Converter', category: 'effect', type: 'mastering' as any, version: '1.0.0', description: 'High-quality sample rate conversion with anti-aliasing', author: 'Max Booster', parameters: [{ id: 'targetRate', name: 'Target Rate', type: 'float', defaultValue: 44100, minValue: 22050, maxValue: 192000, automatable: false }, { id: 'quality', name: 'Quality', type: 'float', defaultValue: 2, minValue: 0, maxValue: 3, automatable: false }, { id: 'antiAlias', name: 'Anti-Alias', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { targetRate: 44100, quality: 2, antiAlias: 1 } };

export default MbSrcPlugin;
