import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDelayStereoPlugin: PluginDefinition = {
  id: "mb-delay-stereo",
  slug: "mb-delay-stereo",
  name: "MB Stereo Delay",
  category: "effect",
  type: "delay",
  version: "1.0.0",
  description: "Classic stereo delay",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "time",
      name: "Time",
      type: "float",
      defaultValue: 250,
      minValue: 1,
      maxValue: 2000,
      automatable: true,
    },
    {
      id: "feedback",
      name: "Feedback",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 0.95,
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
  defaultPreset: { time: 250, feedback: 0.4, mix: 0.3 },
};

export default MbDelayStereoPlugin;
