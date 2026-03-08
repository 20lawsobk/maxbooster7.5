import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeRetriggerPlugin: PluginDefinition = { id: 'mb-time-retrigger', slug: 'mb-time-retrigger', name: 'MB Re-Trigger', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Capture audio buffer and retrigger with pitch ramp', author: 'Max Booster', parameters: [{ id: 'bufferSize', name: 'Buffer Size', type: 'float', defaultValue: 100, minValue: 10, maxValue: 1000, automatable: true }, { id: 'rate', name: 'Rate', type: 'float', defaultValue: 4, minValue: 1, maxValue: 32, automatable: true }, { id: 'pitchRamp', name: 'Pitch Ramp', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { bufferSize: 100, rate: 4, pitchRamp: 0, mix: 1 } };

export default MbTimeRetriggerPlugin;
