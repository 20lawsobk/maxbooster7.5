import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDistSoftPlugin: PluginDefinition = { id: 'mb-dist-soft', slug: 'mb-dist-soft', name: 'MB Soft Clipper', category: 'effect', type: 'distortion', version: '1.0.0', description: 'Gentle soft clipping', author: 'Max Booster', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -6, minValue: -24, maxValue: 0, automatable: true }, { id: 'knee', name: 'Knee', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { threshold: -6, knee: 0.5 } };

export default MbDistSoftPlugin;
