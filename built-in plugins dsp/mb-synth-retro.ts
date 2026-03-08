import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthRetroPlugin: PluginDefinition = {
    id: 'mb-synth-retro', slug: 'mb-synth-retro', name: 'MB Retro Synth', category: 'instrument', type: 'analog', version: '1.0.0',
    description: '80s retro synth tones', author: 'Max Booster',
    oscillators: [{ type: 'square', detune: 0, gain: 0.4 }, { type: 'sawtooth', detune: 0, gain: 0.4 }, { type: 'triangle', detune: 1200, gain: 0.2 }],
    envelope: { attack: 0.1, decay: 0.5, sustain: 0.5, release: 0.6 },
    parameters: [
      { id: 'chorus', name: 'Chorus', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { chorus: 0.5, volume: 0.8 },
  };

export default MbSynthRetroPlugin;
