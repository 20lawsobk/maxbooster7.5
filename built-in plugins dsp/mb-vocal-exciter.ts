import type { PluginDefinition } from "../server/services/pluginHostService";

const MbVocalExciterPlugin: PluginDefinition = {
  id: "mb-vocal-exciter",
  slug: "mb-vocal-exciter",
  name: "MB Vocal Exciter",
  category: "effect",
  type: "vocal",
  version: "1.0.0",
  description: "Vocal clarity enhancer",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "amount",
      name: "Amount",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "freq",
      name: "Frequency",
      type: "float",
      defaultValue: 3000,
      minValue: 1000,
      maxValue: 8000,
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
  defaultPreset: { amount: 0.3, freq: 3000, mix: 0.5 },
};

export default MbVocalExciterPlugin;
