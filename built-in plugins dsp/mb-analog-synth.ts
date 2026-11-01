import type { PluginDefinition } from "../server/services/pluginHostService";

const MbAnalogSynthPlugin: PluginDefinition = {
  id: "mb-analog-synth",
  slug: "mb-analog-synth",
  name: "MB Analog Synth",
  category: "instrument",
  type: "analog",
  version: "1.0.0",
  description:
    "Classic analog synthesizer with dual oscillators and ladder filter",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "square", detune: -0.1, gain: 0.3 },
  ],
  envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4 },
  parameters: [
    {
      id: "cutoff",
      name: "Filter Cutoff",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "resonance",
      name: "Resonance",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "lfoRate",
      name: "LFO Rate",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { cutoff: 0.5, resonance: 0.3, lfoRate: 0.3, volume: 0.8 },
};

export default MbAnalogSynthPlugin;
