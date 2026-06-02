import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDelayModPlugin: PluginDefinition = {
  id: "mb-delay-mod",
  slug: "mb-delay-mod",
  name: "MB Modulated Delay",
  category: "effect",
  type: "delay",
  version: "1.0.0",
  description: "Modulated delay with chorus",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "time",
      name: "Time",
      type: "float",
      defaultValue: 350,
      minValue: 50,
      maxValue: 1500,
      automatable: true,
    },
    {
      id: "modRate",
      name: "Mod Rate",
      type: "float",
      defaultValue: 0.5,
      minValue: 0.1,
      maxValue: 5,
      automatable: true,
    },
    {
      id: "modDepth",
      name: "Mod Depth",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { time: 350, modRate: 0.5, modDepth: 0.3, mix: 0.3 },
};

export default MbDelayModPlugin;
