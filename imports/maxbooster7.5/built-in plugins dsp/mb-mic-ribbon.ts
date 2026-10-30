import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMicRibbonPlugin: PluginDefinition = {
  id: "mb-mic-ribbon",
  slug: "mb-mic-ribbon",
  name: "MB Ribbon Modeler",
  category: "effect",
  type: "microphone",
  version: "1.0.0",
  description: "Vintage ribbon mic character",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "warmth",
      name: "Warmth",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "roll-off",
      name: "HF Roll-off",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "proximity",
      name: "Proximity",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { warmth: 0.6, "roll-off": 0.4, proximity: 0.3 },
};

export default MbMicRibbonPlugin;
