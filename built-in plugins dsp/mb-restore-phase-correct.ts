import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestorePhaseCorrectPlugin: PluginDefinition = { id: 'mb-restore-phase-correct', slug: 'mb-restore-phase-correct', name: 'MB Phase Correction', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Automatic multi-mic phase alignment and correction', author: 'Max Booster', grade: 'A', parameters: [{ id: 'maxDelay', name: 'Max Delay', type: 'float', defaultValue: 10, minValue: 1, maxValue: 50, automatable: false }, { id: 'sensitivity', name: 'Sensitivity', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'flipPhase', name: 'Flip Phase', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { maxDelay: 10, sensitivity: 0.7, flipPhase: 0 } };

export default MbRestorePhaseCorrectPlugin;
