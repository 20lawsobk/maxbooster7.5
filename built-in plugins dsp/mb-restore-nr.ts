import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreNrPlugin: PluginDefinition = { id: 'mb-restore-nr', slug: 'mb-restore-nr', name: 'MB Noise Reduction', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Spectral noise reduction with noise profile learning', author: 'Max Booster', parameters: [{ id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 20, minValue: 0, maxValue: 60, automatable: true }, { id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 5, minValue: 0, maxValue: 20, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 5, minValue: 0.5, maxValue: 50, automatable: true }], defaultPreset: { reduction: 20, sensitivity: 0.5, smoothing: 5, attack: 5 } };

export default MbRestoreNrPlugin;
