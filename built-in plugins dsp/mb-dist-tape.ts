import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDistTapePlugin: PluginDefinition = {
  id: "mb-dist-tape",
  slug: "mb-dist-tape",
  name: "MB Tape Saturation",
  category: "effect",
  type: "distortion",
  version: "1.0.0",
  description: "Analog tape warmth",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "saturation",
      name: "Saturation",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "bias",
      name: "Bias",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { saturation: 0.4, bias: 0.5, mix: 1 },
};

export default MbDistTapePlugin;
