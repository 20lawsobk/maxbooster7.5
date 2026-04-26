import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthMonoPlugin: PluginDefinition = {
    id: 'mb-synth-mono', slug: 'mb-synth-mono', name: 'MB Mono Lead', category: 'instrument', type: 'analog', version: '1.0.0',
    description: 'Fat monophonic lead', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sawtooth', detune: 0, gain: 0.6 }, { type: 'square', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.3 },
    parameters: [
      { id: 'glide', name: 'Glide', type: 'float', defaultValue: 0.1, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { glide: 0.1, volume: 0.8 },
  };

export default MbSynthMonoPlugin;
