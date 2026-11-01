import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPadVintagePlugin: PluginDefinition = {
  id: "mb-pad-vintage",
  slug: "mb-pad-vintage",
  name: "MB Vintage Pad",
  category: "instrument",
  type: "pad",
  version: "1.0.0",
  description: "Classic analog synth pad",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.4 },
    { type: "square", detune: -5, gain: 0.3 },
    { type: "square", detune: 5, gain: 0.3 },
  ],
  envelope: { attack: 0.4, decay: 0.6, sustain: 0.8, release: 1.2 },
  parameters: [
    {
      id: "filter",
      name: "Filter",
      type: "float",
      defaultValue: 5000,
      minValue: 500,
      maxValue: 15000,
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
  defaultPreset: { filter: 5000, volume: 0.7 },
};

export default MbPadVintagePlugin;
