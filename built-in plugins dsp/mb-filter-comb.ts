import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFilterCombPlugin: PluginDefinition = {
  id: "mb-filter-comb",
  slug: "mb-filter-comb",
  name: "MB Comb Filter",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Comb filter for metallic and tuned resonance effects",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "freq",
      name: "Frequency",
      type: "float",
      defaultValue: 500,
      minValue: 50,
      maxValue: 5000,
      automatable: true,
    },
    {
      id: "feedback",
      name: "Feedback",
      type: "float",
      defaultValue: 0.5,
      minValue: -0.99,
      maxValue: 0.99,
      automatable: true,
    },
    {
      id: "damping",
      name: "Damping",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
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
  defaultPreset: { freq: 500, feedback: 0.5, damping: 0.5, mix: 0.5 },
};

export default MbFilterCombPlugin;
