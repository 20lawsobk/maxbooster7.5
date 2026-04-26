import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMonoMakerPlugin: PluginDefinition = { id: 'mb-mono-maker', slug: 'mb-mono-maker', name: 'MB Mono Maker', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'Collapse low frequencies to mono for tighter bass', author: 'Max Booster', grade: 'A', parameters: [{ id: 'frequency', name: 'Frequency', type: 'float', defaultValue: 120, minValue: 20, maxValue: 500, automatable: true }, { id: 'slope', name: 'Slope', type: 'float', defaultValue: 12, minValue: 6, maxValue: 48, automatable: false }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { frequency: 120, slope: 12, mix: 1 } };

export default MbMonoMakerPlugin;
