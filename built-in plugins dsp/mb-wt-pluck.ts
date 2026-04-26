import type { PluginDefinition } from '../server/services/pluginHostService';

const MbWtPluckPlugin: PluginDefinition = { id: 'mb-wt-pluck', slug: 'mb-wt-pluck', name: 'MB WT Pluck', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Sharp wavetable pluck', author: 'Max Booster', grade: 'A', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.8 }], envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.5, attack: 0.8, volume: 0.8 } };

export default MbWtPluckPlugin;
