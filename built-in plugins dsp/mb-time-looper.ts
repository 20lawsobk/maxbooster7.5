import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeLooperPlugin: PluginDefinition = { id: 'mb-time-looper', slug: 'mb-time-looper', name: 'MB Micro Looper', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Live micro-looping effect with overdub and decay', author: 'Max Booster', grade: 'A', parameters: [{ id: 'loopLength', name: 'Loop Length', type: 'float', defaultValue: 500, minValue: 50, maxValue: 5000, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true }, { id: 'speed', name: 'Speed', type: 'float', defaultValue: 1, minValue: 0.25, maxValue: 4, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { loopLength: 500, decay: 0.9, speed: 1, mix: 0.5 } };

export default MbTimeLooperPlugin;
