import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVocalAutotunePlugin: PluginDefinition = { id: 'mb-vocal-autotune', slug: 'mb-vocal-autotune', name: 'MB Auto-Tune', category: 'effect', type: 'vocal', version: '1.0.0', description: 'Real-time pitch correction', author: 'Max Booster', parameters: [{ id: 'key', name: 'Key', type: 'float', defaultValue: 0, minValue: 0, maxValue: 11, automatable: false }, { id: 'scale', name: 'Scale', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: false }, { id: 'speed', name: 'Speed', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'humanize', name: 'Humanize', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { key: 0, scale: 0, speed: 0.5, humanize: 0.3 } };

export default MbVocalAutotunePlugin;
