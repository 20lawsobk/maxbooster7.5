import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPadCinematicPlugin: PluginDefinition = {
    id: 'mb-pad-cinematic', slug: 'mb-pad-cinematic', name: 'MB Cinematic Pad', category: 'instrument', type: 'pad', version: '1.0.0',
    description: 'Epic cinematic atmosphere', author: 'Max Booster',
    oscillators: [{ type: 'sawtooth', detune: -15, gain: 0.2 }, { type: 'sawtooth', detune: 15, gain: 0.2 }, { type: 'triangle', detune: 0, gain: 0.3 }, { type: 'sine', detune: -1200, gain: 0.3 }],
    envelope: { attack: 2.5, decay: 1.5, sustain: 0.9, release: 4.0 },
    parameters: [
      { id: 'epic', name: 'Epic', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { epic: 0.8, volume: 0.7 },
  };

export default MbPadCinematicPlugin;
