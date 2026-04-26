import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDistTubePlugin: PluginDefinition = { id: 'mb-dist-tube', slug: 'mb-dist-tube', name: 'MB Tube Distortion', category: 'effect', type: 'distortion', version: '1.0.0', description: 'Warm tube saturation', author: 'Max Booster', grade: 'A', parameters: [{ id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'tone', name: 'Tone', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { drive: 0.3, tone: 0.5, mix: 1 } };

export default MbDistTubePlugin;
