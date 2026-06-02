import type { PluginDefinition } from "../server/services/pluginHostService";

const MbTimeBeatrepeatPlugin: PluginDefinition = {
  id: "mb-time-beatrepeat",
  slug: "mb-time-beatrepeat",
  name: "MB Beat Repeat",
  category: "effect",
  type: "delay" as any,
  version: "1.0.0",
  description: "Capture and repeat beats with pitch and decay control",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "interval",
      name: "Interval",
      type: "float",
      defaultValue: 4,
      minValue: 1,
      maxValue: 16,
      automatable: true,
    },
    {
      id: "repeats",
      name: "Repeats",
      type: "float",
      defaultValue: 4,
      minValue: 1,
      maxValue: 32,
      automatable: true,
    },
    {
      id: "decay",
      name: "Decay",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "pitchShift",
      name: "Pitch Shift",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { interval: 4, repeats: 4, decay: 0.5, pitchShift: 0, mix: 1 },
};

export default MbTimeBeatrepeatPlugin;
