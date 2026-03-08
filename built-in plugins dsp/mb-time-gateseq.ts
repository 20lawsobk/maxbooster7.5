import type { PluginDefinition } from '../server/services/pluginHostService';

const MbTimeGateseqPlugin: PluginDefinition = { id: 'mb-time-gateseq', slug: 'mb-time-gateseq', name: 'MB Gate Sequencer', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Programmable gate sequencer for rhythmic chopping', author: 'Max Booster', parameters: [{ id: 'steps', name: 'Steps', type: 'float', defaultValue: 16, minValue: 4, maxValue: 32, automatable: false }, { id: 'pattern', name: 'Pattern', type: 'float', defaultValue: 0, minValue: 0, maxValue: 15, automatable: false }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 5, minValue: 0, maxValue: 50, automatable: true }, { id: 'velocity', name: 'Velocity', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { steps: 16, pattern: 0, smoothing: 5, velocity: 0.5 } };

export default MbTimeGateseqPlugin;
