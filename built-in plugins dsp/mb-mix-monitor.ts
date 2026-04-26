import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixMonitorPlugin: PluginDefinition = { id: 'mb-mix-monitor', slug: 'mb-mix-monitor', name: 'MB Monitor Controller', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Reference monitor controller with dim, mono, and speaker switching', author: 'Max Booster', grade: 'A', parameters: [{ id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'dim', name: 'Dim', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'mono', name: 'Mono', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: false }, { id: 'speaker', name: 'Speaker Select', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { volume: 0.7, dim: 0, mono: 0, speaker: 0 } };

export default MbMixMonitorPlugin;
