import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreDecracklePlugin: PluginDefinition = { id: 'mb-restore-decrackle', slug: 'mb-restore-decrackle', name: 'MB De-Crackle', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Remove vinyl crackle and surface noise from recordings', author: 'Max Booster', grade: 'A', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: 30, minValue: 0, maxValue: 100, automatable: true }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'quality', name: 'Quality', type: 'float', defaultValue: 2, minValue: 0, maxValue: 3, automatable: false }], defaultPreset: { threshold: 30, reduction: 0.7, quality: 2 } };

export default MbRestoreDecracklePlugin;
