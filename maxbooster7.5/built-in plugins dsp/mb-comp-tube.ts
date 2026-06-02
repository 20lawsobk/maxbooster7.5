import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCompTubePlugin: PluginDefinition = {
  id: "mb-comp-tube",
  slug: "mb-comp-tube",
  name: "MB Tube Comp",
  category: "effect",
  type: "compressor",
  version: "1.0.0",
  description: "Warm tube compression",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -16,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "ratio",
      name: "Ratio",
      type: "float",
      defaultValue: 4,
      minValue: 1,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "drive",
      name: "Drive",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { threshold: -16, ratio: 4, drive: 0.3 },
};

export default MbCompTubePlugin;
