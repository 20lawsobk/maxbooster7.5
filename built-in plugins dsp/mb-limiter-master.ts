import type { PluginDefinition } from "../server/services/pluginHostService";

const MbLimiterMasterPlugin: PluginDefinition = {
  id: "mb-limiter-master",
  slug: "mb-limiter-master",
  name: "MB Master Limiter",
  category: "effect",
  type: "limiter",
  version: "1.0.0",
  description: "Transparent mastering limiter",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "ceiling",
      name: "Ceiling",
      type: "float",
      defaultValue: -0.3,
      minValue: -6,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -6,
      minValue: -24,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "release",
      name: "Release",
      type: "float",
      defaultValue: 100,
      minValue: 10,
      maxValue: 1000,
      automatable: true,
    },
  ],
  defaultPreset: { ceiling: -0.3, threshold: -6, release: 100 },
};

export default MbLimiterMasterPlugin;
