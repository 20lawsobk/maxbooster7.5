import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDelayMultiPlugin: PluginDefinition = {
  id: "mb-delay-multi",
  slug: "mb-delay-multi",
  name: "MB Multi-Tap",
  category: "effect",
  type: "delay",
  version: "1.0.0",
  description: "Multi-tap rhythm delay",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "taps",
      name: "Taps",
      type: "float",
      defaultValue: 4,
      minValue: 2,
      maxValue: 8,
      automatable: false,
    },
    {
      id: "time",
      name: "Time",
      type: "float",
      defaultValue: 500,
      minValue: 100,
      maxValue: 2000,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 0.35,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { taps: 4, time: 500, mix: 0.35 },
};

export default MbDelayMultiPlugin;
