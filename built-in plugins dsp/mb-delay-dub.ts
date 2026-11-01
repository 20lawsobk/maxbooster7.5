import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDelayDubPlugin: PluginDefinition = {
  id: "mb-delay-dub",
  slug: "mb-delay-dub",
  name: "MB Dub Delay",
  category: "effect",
  type: "delay",
  version: "1.0.0",
  description: "Classic dub echo",
  author: "Max Booster",
  grade: "A",
  parameters: [
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
      id: "feedback",
      name: "Feedback",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 0.95,
      automatable: true,
    },
    {
      id: "filter",
      name: "Filter",
      type: "float",
      defaultValue: 3000,
      minValue: 500,
      maxValue: 10000,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { time: 500, feedback: 0.6, filter: 3000, mix: 0.4 },
};

export default MbDelayDubPlugin;
