import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilPhasePlugin: PluginDefinition = { id: 'mb-util-phase', slug: 'mb-util-phase', name: 'MB Phase Rotator', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Linear phase rotation for asymmetric waveform correction', author: 'Max Booster', parameters: [{ id: 'angle', name: 'Phase Angle', type: 'float', defaultValue: 0, minValue: 0, maxValue: 360, automatable: true }, { id: 'stages', name: 'Stages', type: 'float', defaultValue: 4, minValue: 1, maxValue: 12, automatable: false }], defaultPreset: { angle: 0, stages: 4 } };

export default MbUtilPhasePlugin;
