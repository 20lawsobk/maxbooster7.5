import type { PluginDefinition } from "../server/services/pluginHostService";

const MbUtilTrimPlugin: PluginDefinition = {
  id: "mb-util-trim",
  slug: "mb-util-trim",
  name: "MB Trim",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Simple gain trim with channel swap and balance",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "gainL",
      name: "Gain L",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "gainR",
      name: "Gain R",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "swap",
      name: "Channel Swap",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: false,
    },
  ],
  defaultPreset: { gainL: 0, gainR: 0, swap: 0 },
};

export default MbUtilTrimPlugin;
