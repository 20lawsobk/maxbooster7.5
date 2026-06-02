import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFilterNotchPlugin: PluginDefinition = {
  id: "mb-filter-notch",
  slug: "mb-filter-notch",
  name: "MB Notch Filter",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Precision notch filter for removing specific frequencies",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "freq",
      name: "Frequency",
      type: "float",
      defaultValue: 1000,
      minValue: 20,
      maxValue: 20000,
      automatable: true,
    },
    {
      id: "q",
      name: "Q",
      type: "float",
      defaultValue: 10,
      minValue: 1,
      maxValue: 50,
      automatable: true,
    },
    {
      id: "depth",
      name: "Depth",
      type: "float",
      defaultValue: -60,
      minValue: -80,
      maxValue: 0,
      automatable: true,
    },
  ],
  defaultPreset: { freq: 1000, q: 10, depth: -60 },
};

export default MbFilterNotchPlugin;
