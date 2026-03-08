import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMicPreampPlugin: PluginDefinition = { id: 'mb-mic-preamp', slug: 'mb-mic-preamp', name: 'MB Mic Preamp', category: 'effect', type: 'microphone', version: '1.0.0', description: 'Vintage mic preamp coloration', author: 'Max Booster', parameters: [{ id: 'gain', name: 'Gain', type: 'float', defaultValue: 20, minValue: 0, maxValue: 60, automatable: true }, { id: 'impedance', name: 'Impedance', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'color', name: 'Color', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { gain: 20, impedance: 0.5, color: 0.3 } };

export default MbMicPreampPlugin;
