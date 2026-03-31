import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilPanPlugin: PluginDefinition = { id: 'mb-util-pan', slug: 'mb-util-pan', name: 'MB Panner', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Stereo panning with pan law selection', author: 'Max Booster', parameters: [{ id: 'pan', name: 'Pan', type: 'float', defaultValue: 0, minValue: -1, maxValue: 1, automatable: true }, { id: 'panLaw', name: 'Pan Law', type: 'float', defaultValue: -3, minValue: -6, maxValue: 0, automatable: false }, { id: 'width', name: 'Width', type: 'float', defaultValue: 1, minValue: 0, maxValue: 2, automatable: true }], defaultPreset: { pan: 0, panLaw: -3, width: 1 } };

export default MbUtilPanPlugin;
