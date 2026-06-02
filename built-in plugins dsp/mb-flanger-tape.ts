import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFlangerTapePlugin: PluginDefinition = {
  id: "mb-flanger-tape",
  slug: "mb-flanger-tape",
  name: "MB Tape Flanger",
  category: "effect",
  type: "flanger",
  version: "1.0.0",
  description: "Classic tape flanging",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "rate",
      name: "Rate",
      type: "float",
      defaultValue: 0.2,
      minValue: 0.01,
      maxValue: 3,
      automatable: true,
    },
    {
      id: "depth",
      name: "Depth",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "feedback",
      name: "Feedback",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 0.95,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { rate: 0.2, depth: 0.6, feedback: 0.5, mix: 0.5 },
};

export default MbFlangerTapePlugin;
