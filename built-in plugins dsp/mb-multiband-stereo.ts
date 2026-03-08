import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMultibandStereoPlugin: PluginDefinition = { id: 'mb-multiband-stereo', slug: 'mb-multiband-stereo', name: 'MB Multiband Stereo', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: '4-band independent stereo width control', author: 'Max Booster', parameters: [{ id: 'lowWidth', name: 'Low Width', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 2, automatable: true }, { id: 'lowMidWidth', name: 'Low-Mid Width', type: 'float', defaultValue: 1, minValue: 0, maxValue: 2, automatable: true }, { id: 'highMidWidth', name: 'High-Mid Width', type: 'float', defaultValue: 1.2, minValue: 0, maxValue: 2, automatable: true }, { id: 'highWidth', name: 'High Width', type: 'float', defaultValue: 1.5, minValue: 0, maxValue: 2, automatable: true }], defaultPreset: { lowWidth: 0.5, lowMidWidth: 1, highMidWidth: 1.2, highWidth: 1.5 } };

export default MbMultibandStereoPlugin;
