import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPadPlugin: PluginDefinition = {
  id: "mb-pad",
  slug: "mb-pad",
  name: "MB Synth Pad",
  category: "instrument",
  type: "pad",
  version: "1.0.0",
  description: "Atmospheric pad synthesizer with rich textures",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -7, gain: 0.25 },
    { type: "sawtooth", detune: 7, gain: 0.25 },
    { type: "sine", detune: 1200, gain: 0.2 },
    { type: "triangle", detune: 0, gain: 0.3 },
  ],
  envelope: { attack: 0.8, decay: 1.0, sustain: 0.9, release: 2.0 },
  parameters: [
    {
      id: "detune",
      name: "Detune",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "filter",
      name: "Filter",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "chorus",
      name: "Chorus",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { detune: 0.5, filter: 0.5, chorus: 0.4, volume: 0.7 },
};

export default MbPadPlugin;
