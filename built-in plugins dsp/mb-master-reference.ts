import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMasterReferencePlugin: PluginDefinition = { id: 'mb-master-reference', slug: 'mb-master-reference', name: 'MB Reference Player', category: 'effect', type: 'mastering' as any, version: '1.0.0', description: 'A/B reference comparison tool for mastering decisions', author: 'Max Booster', grade: 'A', parameters: [{ id: 'gain', name: 'Reference Gain', type: 'float', defaultValue: 0, minValue: -24, maxValue: 24, automatable: true }, { id: 'lowCut', name: 'Low Cut', type: 'float', defaultValue: 20, minValue: 20, maxValue: 200, automatable: true }, { id: 'highCut', name: 'High Cut', type: 'float', defaultValue: 20000, minValue: 5000, maxValue: 20000, automatable: true }], defaultPreset: { gain: 0, lowCut: 20, highCut: 20000 } };

export default MbMasterReferencePlugin;
