import type { PluginDefinition } from "../server/services/pluginHostService";

const MbChorusVintagePlugin: PluginDefinition = {
  id: "mb-chorus-vintage",
  slug: "mb-chorus-vintage",
  name: "MB Vintage Chorus",
  category: "effect",
  type: "chorus",
  version: "1.0.0",
  description: "80s vintage chorus",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "rate",
      name: "Rate",
      type: "float",
      defaultValue: 0.8,
      minValue: 0.1,
      maxValue: 5,
      automatable: true,
    },
    {
      id: "depth",
      name: "Depth",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { rate: 0.8, depth: 0.6, mix: 0.5 },
};

export default MbChorusVintagePlugin;
