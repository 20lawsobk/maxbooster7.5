import type { PluginDefinition } from '../server/services/pluginHostService';

const MbAnalogPolysynthPlugin: PluginDefinition = {
    id: 'mb-analog-polysynth',
    slug: 'mb-analog-polysynth',
    name: 'MB Analog Poly',
    category: 'instrument',
    type: 'analog',
    version: '1.0.0',
    description: 'Classic analog polyphonic synthesizer with fat oscillators and resonant filters',
    author: 'Max Booster', grade: 'A',
    oscillators: [
      { type: 'sawtooth', detune: -7, gain: 0.4 },
      { type: 'sawtooth', detune: 7, gain: 0.4 },
      { type: 'square', detune: 0, gain: 0.2 },
    ],
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.3 },
    parameters: [
      { id: 'osc1_shape', name: 'Osc 1 Shape', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'osc2_shape', name: 'Osc 2 Shape', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'osc_mix', name: 'Oscillator Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'filter_cutoff', name: 'Filter Cutoff', type: 'float', defaultValue: 8000, minValue: 20, maxValue: 20000, unit: 'Hz', automatable: true },
      { id: 'filter_res', name: 'Filter Resonance', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'filter_env', name: 'Filter Envelope', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'lfo_rate', name: 'LFO Rate', type: 'float', defaultValue: 2, minValue: 0.1, maxValue: 20, unit: 'Hz', automatable: true },
      { id: 'lfo_depth', name: 'LFO Depth', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true },
      { id: 'unison', name: 'Unison Voices', type: 'int', defaultValue: 1, minValue: 1, maxValue: 8, automatable: false },
      { id: 'detune', name: 'Unison Detune', type: 'float', defaultValue: 10, minValue: 0, maxValue: 50, unit: 'cents', automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { osc1_shape: 0.5, osc2_shape: 0.5, osc_mix: 0.5, filter_cutoff: 8000, filter_res: 0.3, filter_env: 0.5, lfo_rate: 2, lfo_depth: 0.2, unison: 1, detune: 10, volume: 0.8 },
  };

export default MbAnalogPolysynthPlugin;
