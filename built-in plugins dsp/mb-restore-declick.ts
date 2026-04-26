import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreDeclickPlugin: PluginDefinition = { id: 'mb-restore-declick', slug: 'mb-restore-declick', name: 'MB De-Click', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Detect and remove clicks, pops, and transient artifacts', author: 'Max Booster', grade: 'A', parameters: [{ id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 50, minValue: 0, maxValue: 100, automatable: true }, { id: 'clickWidth', name: 'Click Width', type: 'float', defaultValue: 5, minValue: 1, maxValue: 20, automatable: false }, { id: 'interpolation', name: 'Interpolation', type: 'float', defaultValue: 1, minValue: 0, maxValue: 2, automatable: false }], defaultPreset: { sensitivity: 50, clickWidth: 5, interpolation: 1 } };

export default MbRestoreDeclickPlugin;
