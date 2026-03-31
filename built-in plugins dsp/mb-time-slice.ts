import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeSlicePlugin: PluginDefinition = { id: 'mb-time-slice', slug: 'mb-time-slice', name: 'MB Audio Slicer', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Rhythmic gating slicer with pattern sequencing', author: 'Max Booster', parameters: [{ id: 'steps', name: 'Steps', type: 'float', defaultValue: 16, minValue: 4, maxValue: 32, automatable: false }, { id: 'swing', name: 'Swing', type: 'float', defaultValue: 0, minValue: -0.5, maxValue: 0.5, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 50, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 10, minValue: 1, maxValue: 200, automatable: true }], defaultPreset: { steps: 16, swing: 0, attack: 1, release: 10 } };

export default MbTimeSlicePlugin;
