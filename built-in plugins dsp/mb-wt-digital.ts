import type { PluginDefinition } from '../server/services/pluginHostService';

const MbWtDigitalPlugin: PluginDefinition = { id: 'mb-wt-digital', slug: 'mb-wt-digital', name: 'MB Digital Keys', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Clean digital wavetable keys', author: 'Max Booster', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.01, decay: 0.5, sustain: 0.5, release: 0.4 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true }, { id: 'brightness', name: 'Brightness', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.2, brightness: 0.6, volume: 0.8 } };

export default MbWtDigitalPlugin;
