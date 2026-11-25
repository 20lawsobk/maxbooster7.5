import type { PluginDefinition } from "../server/services/pluginHostService";

const MbLimiterSoftPlugin: PluginDefinition = {
  id: "mb-limiter-soft",
  slug: "mb-limiter-soft",
  name: "MB Soft Limiter",
  category: "effect",
  type: "limiter",
  version: "1.0.0",
  description: "Gentle peak limiting",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "ceiling",
      name: "Ceiling",
      type: "float",
      defaultValue: -1,
      minValue: -12,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "knee",
      name: "Knee",
      type: "float",
      defaultValue: 6,
      minValue: 0,
      maxValue: 12,
      automatable: true,
    },
  ],
  defaultPreset: { ceiling: -1, knee: 6 },
};

export default MbLimiterSoftPlugin;
