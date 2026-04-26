import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixHeadphonePlugin: PluginDefinition = { id: 'mb-mix-headphone', slug: 'mb-mix-headphone', name: 'MB Headphone Mix', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Headphone mixing correction with crossfeed and room simulation', author: 'Max Booster', grade: 'A', parameters: [{ id: 'crossfeed', name: 'Crossfeed', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'room', name: 'Room Sim', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'bass', name: 'Bass Comp', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'output', name: 'Output', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { crossfeed: 0.3, room: 0.4, bass: 0.3, output: 0.8 } };

export default MbMixHeadphonePlugin;
