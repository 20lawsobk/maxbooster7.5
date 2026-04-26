import type { PluginDefinition } from '../server/services/pluginHostService';

const MbWtSerumPlugin: PluginDefinition = { id: 'mb-wt-serum', slug: 'mb-wt-serum', name: 'MB Serum Style', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Modern wavetable synthesis', author: 'Max Booster', grade: 'A', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.7 }], envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.4 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'morph', name: 'Morph', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0, morph: 0.5, volume: 0.8 } };

export default MbWtSerumPlugin;
