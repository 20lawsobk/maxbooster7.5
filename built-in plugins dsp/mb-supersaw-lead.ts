import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSupersawLeadPlugin: PluginDefinition = {
    id: 'mb-supersaw-lead',
    slug: 'mb-supersaw-lead',
    name: 'MB Supersaw Lead',
    category: 'instrument',
    type: 'synth',
    version: '1.0.0',
    description: 'Massive supersaw lead synth for EDM and trance productions',
    author: 'Max Booster',
    oscillators: [
      { type: 'sawtooth', detune: -25, gain: 0.15 },
      { type: 'sawtooth', detune: -15, gain: 0.2 },
      { type: 'sawtooth', detune: -5, gain: 0.25 },
      { type: 'sawtooth', detune: 0, gain: 0.3 },
      { type: 'sawtooth', detune: 5, gain: 0.25 },
      { type: 'sawtooth', detune: 15, gain: 0.2 },
      { type: 'sawtooth', detune: 25, gain: 0.15 },
    ],
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.4 },
    parameters: [
      { id: 'voices', name: 'Supersaw Voices', type: 'int', defaultValue: 7, minValue: 3, maxValue: 16, automatable: false },
      { id: 'detune', name: 'Supersaw Detune', type: 'float', defaultValue: 25, minValue: 0, maxValue: 100, unit: 'cents', automatable: true },
      { id: 'filter_cutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 12000, minValue: 100, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'filter_res', name: 'Filter Resonance', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'stereo_width', name: 'Stereo Width', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
      { id: 'attack', name: 'Attack', type: 'float', defaultValue: 0.01, minValue: 0.001, maxValue: 2, unit: 's', automatable: true },
      { id: 'release', name: 'Release', type: 'float', defaultValue: 0.4, minValue: 0.01, maxValue: 5, unit: 's', automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { voices: 7, detune: 25, filter_cutoff: 12000, filter_res: 0.2, stereo_width: 0.8, attack: 0.01, release: 0.4, volume: 0.8 },
  };

export default MbSupersawLeadPlugin;
