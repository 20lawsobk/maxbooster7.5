import type { PluginDefinition } from '../server/services/pluginHostService';

const MbWtSupersawPlugin: PluginDefinition = { id: 'mb-wt-supersaw', slug: 'mb-wt-supersaw', name: 'MB WT Supersaw', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Wavetable supersaw stack', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: -10, gain: 0.35 }, { type: 'sawtooth', detune: 10, gain: 0.35 }], envelope: { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.4, minValue: 0, maxValue: 1, automatable: true }, { id: 'detune', name: 'Detune', type: 'float', defaultValue: 10, minValue: 0, maxValue: 50, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.4, detune: 10, volume: 0.75 } };

export default MbWtSupersawPlugin;
