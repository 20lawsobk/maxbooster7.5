import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDelaySlapbackPlugin: PluginDefinition = {
  id: "mb-delay-slapback",
  slug: "mb-delay-slapback",
  name: "MB Slapback",
  category: "effect",
  type: "delay",
  version: "1.0.0",
  description: "Short slapback echo",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "time",
      name: "Time",
      type: "float",
      defaultValue: 80,
      minValue: 30,
      maxValue: 150,
      automatable: true,
    },
    {
      id: "feedback",
      name: "Feedback",
      type: "float",
      defaultValue: 0.1,
      minValue: 0,
      maxValue: 0.5,
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
  defaultPreset: { time: 80, feedback: 0.1, mix: 0.4 },
};

export default MbDelaySlapbackPlugin;
