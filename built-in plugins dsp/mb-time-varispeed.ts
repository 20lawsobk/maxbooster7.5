import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeVarispeedPlugin: PluginDefinition = { id: 'mb-time-varispeed', slug: 'mb-time-varispeed', name: 'MB Varispeed', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Tape-style varispeed with linked pitch and speed', author: 'Max Booster', parameters: [{ id: 'speed', name: 'Speed', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 3, automatable: true }, { id: 'wow', name: 'Wow', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'flutter', name: 'Flutter', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { speed: 1, wow: 0, flutter: 0 } };

export default MbTimeVarispeedPlugin;
