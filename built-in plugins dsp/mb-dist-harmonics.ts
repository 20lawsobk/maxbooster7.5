import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDistHarmonicsPlugin: PluginDefinition = { id: 'mb-dist-harmonics', slug: 'mb-dist-harmonics', name: 'MB Harmonic Exciter', category: 'effect', type: 'distortion', version: '1.0.0', description: 'Harmonic enhancement', author: 'Max Booster', parameters: [{ id: 'odd', name: 'Odd', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'even', name: 'Even', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { odd: 0.3, even: 0.3, mix: 0.5 } };

export default MbDistHarmonicsPlugin;
