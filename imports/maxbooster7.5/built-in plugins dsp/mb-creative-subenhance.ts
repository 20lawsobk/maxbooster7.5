import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCreativeSubenhancePlugin: PluginDefinition = {
  id: "mb-creative-subenhance",
  slug: "mb-creative-subenhance",
  name: "MB Sub Enhancer",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Generate sub-harmonic bass frequencies from existing content",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "frequency",
      name: "Frequency",
      type: "float",
      defaultValue: 80,
      minValue: 30,
      maxValue: 150,
      automatable: true,
    },
    {
      id: "amount",
      name: "Amount",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "octave",
      name: "Octave",
      type: "float",
      defaultValue: 1,
      minValue: 1,
      maxValue: 2,
      automatable: false,
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
  defaultPreset: { frequency: 80, amount: 0.5, octave: 1, mix: 0.5 },
};

export default MbCreativeSubenhancePlugin;
