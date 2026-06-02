import type { PluginDefinition } from "../server/services/pluginHostService";

const MbVocalHarmonyPlugin: PluginDefinition = {
  id: "mb-vocal-harmony",
  slug: "mb-vocal-harmony",
  name: "MB Harmony Engine",
  category: "effect",
  type: "vocal",
  version: "1.0.0",
  description: "Intelligent harmony generation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "voices",
      name: "Voices",
      type: "float",
      defaultValue: 2,
      minValue: 1,
      maxValue: 4,
      automatable: false,
    },
    {
      id: "interval1",
      name: "Interval 1",
      type: "float",
      defaultValue: 3,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "interval2",
      name: "Interval 2",
      type: "float",
      defaultValue: 5,
      minValue: -12,
      maxValue: 12,
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
  defaultPreset: { voices: 2, interval1: 3, interval2: 5, mix: 0.5 },
};

export default MbVocalHarmonyPlugin;
