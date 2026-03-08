import type { PluginDefinition } from '../server/services/pluginHostService';

const MbLevelerPlugin: PluginDefinition = { id: 'mb-leveler', slug: 'mb-leveler', name: 'MB Auto Leveler', category: 'effect', type: 'compressor', version: '1.0.0', description: 'Automatic gain riding', author: 'Max Booster', parameters: [{ id: 'target', name: 'Target', type: 'float', defaultValue: -18, minValue: -36, maxValue: 0, automatable: true }, { id: 'speed', name: 'Speed', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 1, automatable: true }], defaultPreset: { target: -18, speed: 0.5 } };

export default MbLevelerPlugin;
