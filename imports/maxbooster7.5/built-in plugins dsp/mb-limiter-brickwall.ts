import type { PluginDefinition } from "../server/services/pluginHostService";

const MbLimiterBrickwallPlugin: PluginDefinition = {
  id: "mb-limiter-brickwall",
  slug: "mb-limiter-brickwall",
  name: "MB Brickwall Limiter",
  category: "effect",
  type: "limiter",
  version: "1.0.0",
  description: "Hard brickwall limiting",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "ceiling",
      name: "Ceiling",
      type: "float",
      defaultValue: -0.1,
      minValue: -3,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "release",
      name: "Release",
      type: "float",
      defaultValue: 50,
      minValue: 5,
      maxValue: 500,
      automatable: true,
    },
  ],
  defaultPreset: { ceiling: -0.1, release: 50 },
};

export default MbLimiterBrickwallPlugin;
