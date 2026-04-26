import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMicChannelPlugin: PluginDefinition = { id: 'mb-mic-channel', slug: 'mb-mic-channel', name: 'MB Channel Strip', category: 'effect', type: 'microphone', version: '1.0.0', description: 'Complete mic channel strip', author: 'Max Booster', grade: 'A', parameters: [{ id: 'preampGain', name: 'Preamp', type: 'float', defaultValue: 20, minValue: 0, maxValue: 60, automatable: true }, { id: 'hpf', name: 'HPF', type: 'float', defaultValue: 80, minValue: 20, maxValue: 300, automatable: true }, { id: 'compThresh', name: 'Comp Thresh', type: 'float', defaultValue: -20, minValue: -60, maxValue: 0, automatable: true }, { id: 'eq', name: 'EQ Shape', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { preampGain: 20, hpf: 80, compThresh: -20, eq: 0.5 } };

export default MbMicChannelPlugin;
