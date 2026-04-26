import type { PluginDefinition } from '../server/services/pluginHostService';

const MbStereoImagerMsPlugin: PluginDefinition = { id: 'mb-stereo-imager-ms', slug: 'mb-stereo-imager-ms', name: 'MB MS Stereo Imager', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'Mid-side stereo image processor', author: 'Max Booster', grade: 'A', parameters: [{ id: 'midGain', name: 'Mid Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, automatable: true }, { id: 'sideGain', name: 'Side Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, automatable: true }, { id: 'balance', name: 'Balance', type: 'float', defaultValue: 0, minValue: -1, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { midGain: 0, sideGain: 0, balance: 0, mix: 1 } };

export default MbStereoImagerMsPlugin;
