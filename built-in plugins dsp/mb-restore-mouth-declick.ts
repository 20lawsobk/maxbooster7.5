import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreMouthDeclickPlugin: PluginDefinition = { id: 'mb-restore-mouth-declick', slug: 'mb-restore-mouth-declick', name: 'MB Mouth De-Click', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Specialized mouth click and lip smack removal', author: 'Max Booster', grade: 'A', parameters: [{ id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'clickLength', name: 'Click Length', type: 'float', defaultValue: 5, minValue: 1, maxValue: 20, automatable: false }, { id: 'mode', name: 'Mode', type: 'float', defaultValue: 0, minValue: 0, maxValue: 2, automatable: false }], defaultPreset: { sensitivity: 0.5, clickLength: 5, mode: 0 } };

export default MbRestoreMouthDeclickPlugin;
