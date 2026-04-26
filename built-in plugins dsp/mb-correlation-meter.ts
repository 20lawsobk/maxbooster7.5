import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCorrelationMeterPlugin: PluginDefinition = { id: 'mb-correlation-meter', slug: 'mb-correlation-meter', name: 'MB Correlation Meter', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: 'Phase correlation meter with auto-correction', author: 'Max Booster', grade: 'A', parameters: [{ id: 'autoFix', name: 'Auto Fix', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -0.3, minValue: -1, maxValue: 0, automatable: true }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { autoFix: 0, threshold: -0.3, smoothing: 0.5 } };

export default MbCorrelationMeterPlugin;
