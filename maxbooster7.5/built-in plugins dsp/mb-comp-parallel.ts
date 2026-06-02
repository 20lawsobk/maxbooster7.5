import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCompParallelPlugin: PluginDefinition = {
  id: "mb-comp-parallel",
  slug: "mb-comp-parallel",
  name: "MB Parallel Comp",
  category: "effect",
  type: "compressor",
  version: "1.0.0",
  description: "NY-style parallel compression",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -35,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "ratio",
      name: "Ratio",
      type: "float",
      defaultValue: 8,
      minValue: 1,
      maxValue: 20,
      automatable: true,
    },
    {
      id: "blend",
      name: "Blend",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { threshold: -35, ratio: 8, blend: 0.4 },
};

export default MbCompParallelPlugin;
