import type { PluginDefinition } from '../server/services/pluginHostService';

const MbGateExpanderPlugin: PluginDefinition = { id: 'mb-gate-expander', slug: 'mb-gate-expander', name: 'MB Expander', category: 'effect', type: 'gate', version: '1.0.0', description: 'Downward expansion', author: 'Max Booster', grade: 'A', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -35, minValue: -80, maxValue: 0, automatable: true }, { id: 'ratio', name: 'Ratio', type: 'float', defaultValue: 2, minValue: 1, maxValue: 10, automatable: true }, { id: 'range', name: 'Range', type: 'float', defaultValue: -20, minValue: -80, maxValue: 0, automatable: true }], defaultPreset: { threshold: -35, ratio: 2, range: -20 } };

export default MbGateExpanderPlugin;
