import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreWindPlugin: PluginDefinition = { id: 'mb-restore-wind', slug: 'mb-restore-wind', name: 'MB Wind Noise Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Adaptive wind noise detection and removal for outdoor recordings', author: 'Max Booster', grade: 'A', parameters: [{ id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 18, minValue: 0, maxValue: 40, automatable: true }, { id: 'lowCut', name: 'Low Cut', type: 'float', defaultValue: 80, minValue: 20, maxValue: 200, automatable: true }], defaultPreset: { sensitivity: 0.6, reduction: 18, lowCut: 80 } };

export default MbRestoreWindPlugin;
