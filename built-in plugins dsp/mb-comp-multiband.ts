import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCompMultibandPlugin: PluginDefinition = {
  id: "mb-comp-multiband",
  slug: "mb-comp-multiband",
  name: "MB Multiband Comp",
  category: "effect",
  type: "compressor",
  version: "1.0.0",
  description: "3-band multiband compressor",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "lowThresh",
      name: "Low Thresh",
      type: "float",
      defaultValue: -20,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "midThresh",
      name: "Mid Thresh",
      type: "float",
      defaultValue: -18,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "highThresh",
      name: "High Thresh",
      type: "float",
      defaultValue: -16,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
  ],
  defaultPreset: { lowThresh: -20, midThresh: -18, highThresh: -16 },
};

export default MbCompMultibandPlugin;
