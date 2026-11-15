import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEqChannelPlugin: PluginDefinition = {
  id: "mb-eq-channel",
  slug: "mb-eq-channel",
  name: "MB Channel EQ",
  category: "effect",
  type: "eq",
  version: "1.0.0",
  description: "Console channel strip EQ",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "low",
      name: "Low",
      type: "float",
      defaultValue: 0,
      minValue: -15,
      maxValue: 15,
      automatable: true,
    },
    {
      id: "mid",
      name: "Mid",
      type: "float",
      defaultValue: 0,
      minValue: -15,
      maxValue: 15,
      automatable: true,
    },
    {
      id: "high",
      name: "High",
      type: "float",
      defaultValue: 0,
      minValue: -15,
      maxValue: 15,
      automatable: true,
    },
  ],
  defaultPreset: { low: 0, mid: 0, high: 0 },
};

export default MbEqChannelPlugin;
