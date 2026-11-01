import type { PluginDefinition } from "../server/services/pluginHostService";

const MbTimeStretchPlugin: PluginDefinition = {
  id: "mb-time-stretch",
  slug: "mb-time-stretch",
  name: "MB Time Stretcher",
  category: "effect",
  type: "delay" as any,
  version: "1.0.0",
  description: "High-quality time stretching without pitch change",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "ratio",
      name: "Time Ratio",
      type: "float",
      defaultValue: 1,
      minValue: 0.25,
      maxValue: 4,
      automatable: true,
    },
    {
      id: "quality",
      name: "Quality",
      type: "float",
      defaultValue: 2,
      minValue: 0,
      maxValue: 3,
      automatable: false,
    },
    {
      id: "preserveTransients",
      name: "Preserve Transients",
      type: "float",
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automatable: false,
    },
  ],
  defaultPreset: { ratio: 1, quality: 2, preserveTransients: 1 },
};

export default MbTimeStretchPlugin;
