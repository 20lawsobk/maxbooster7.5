import type { PluginDefinition } from '../server/services/pluginHostService';

const MbWtArpPlugin: PluginDefinition = { id: 'mb-wt-arp', slug: 'mb-wt-arp', name: 'MB WT Arp', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Wavetable arpeggiated sounds', author: 'Max Booster', oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.7 }], envelope: { attack: 0.001, decay: 0.15, sustain: 0.4, release: 0.1 }, parameters: [{ id: 'position', name: 'Wave Position', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true }, { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 5000, minValue: 200, maxValue: 15000, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { position: 0.6, cutoff: 5000, volume: 0.8 } };

export default MbWtArpPlugin;
