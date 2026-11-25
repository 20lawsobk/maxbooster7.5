import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCompOptoPlugin: PluginDefinition = {
  id: "mb-comp-opto",
  slug: "mb-comp-opto",
  name: "MB Opto Comp",
  category: "effect",
  type: "compressor",
  version: "1.0.0",
  description: "Smooth optical compressor",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -24,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "ratio",
      name: "Ratio",
      type: "float",
      defaultValue: 3,
      minValue: 1,
      maxValue: 10,
      automatable: true,
    },
    {
      id: "attack",
      name: "Attack",
      type: "float",
      defaultValue: 20,
      minValue: 5,
      maxValue: 100,
      automatable: true,
    },
    {
      id: "release",
      name: "Release",
      type: "float",
      defaultValue: 200,
      minValue: 50,
      maxValue: 2000,
      automatable: true,
    },
  ],
  defaultPreset: { threshold: -24, ratio: 3, attack: 20, release: 200 },
};

export default MbCompOptoPlugin;
