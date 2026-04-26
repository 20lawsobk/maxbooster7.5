import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStereoWidenerPlugin: PluginDefinition = { id: 'mb-stereo-widener', slug: 'mb-stereo-widener', name: 'MB Stereo Widener', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'Frequency-dependent stereo width enhancement', author: 'Max Booster', grade: 'A', parameters: [{ id: 'width', name: 'Width', type: 'float', defaultValue: 1.2, minValue: 0, maxValue: 3, automatable: true }, { id: 'lowWidth', name: 'Low Width', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 2, automatable: true }, { id: 'highWidth', name: 'High Width', type: 'float', defaultValue: 1.5, minValue: 0, maxValue: 3, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { width: 1.2, lowWidth: 0.8, highWidth: 1.5, mix: 1 } };

export default MbStereoWidenerPlugin;
