import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthAnalogPlugin: PluginDefinition = {
    id: 'mb-synth-analog', slug: 'mb-synth-analog', name: 'MB Analog Lead', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Classic analog lead synth', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.5 }, { type: 'square', detune: -0.1, gain: 0.3 }],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4 },
    parameters: [
      { id: 'cutoff', name: 'Cutoff', type: 'float', defaultValue: 5000, minValue: 100, maxValue: 20000, automatable: true },
      { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { cutoff: 5000, resonance: 0.3, volume: 0.8 },
  };

export default MbSynthAnalogPlugin;
