import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreSpectralPlugin: PluginDefinition = { id: 'mb-restore-spectral', slug: 'mb-restore-spectral', name: 'MB Spectral Repair', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Spectral interpolation for repairing damaged frequency content', author: 'Max Booster', grade: 'A', parameters: [{ id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'bandwidth', name: 'Bandwidth', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { sensitivity: 0.5, bandwidth: 0.5, smoothing: 0.5, mix: 1 } };

export default MbRestoreSpectralPlugin;
