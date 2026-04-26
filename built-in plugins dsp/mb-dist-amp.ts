import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDistAmpPlugin: PluginDefinition = { id: 'mb-dist-amp', slug: 'mb-dist-amp', name: 'MB Amp Sim', category: 'effect', type: 'distortion', version: '1.0.0', description: 'Guitar amp simulation', author: 'Max Booster', grade: 'A', parameters: [{ id: 'gain', name: 'Gain', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'bass', name: 'Bass', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mid', name: 'Mid', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'treble', name: 'Treble', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { gain: 0.5, bass: 0.5, mid: 0.5, treble: 0.5 } };

export default MbDistAmpPlugin;
