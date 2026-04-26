import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMasterTiltPlugin: PluginDefinition = { id: 'mb-master-tilt', slug: 'mb-master-tilt', name: 'MB Master Tilt EQ', category: 'effect', type: 'mastering' as any, version: '1.0.0', description: 'Single-knob tilt EQ for quick tonal balance adjustments', author: 'Max Booster', grade: 'A', parameters: [{ id: 'tilt', name: 'Tilt', type: 'float', defaultValue: 0, minValue: -6, maxValue: 6, automatable: true }, { id: 'pivot', name: 'Pivot Frequency', type: 'float', defaultValue: 1000, minValue: 200, maxValue: 5000, automatable: true }, { id: 'slope', name: 'Slope', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 2, automatable: true }], defaultPreset: { tilt: 0, pivot: 1000, slope: 0.5 } };

export default MbMasterTiltPlugin;
