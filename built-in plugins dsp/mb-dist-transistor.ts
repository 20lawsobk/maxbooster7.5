import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDistTransistorPlugin: PluginDefinition = {
  id: "mb-dist-transistor",
  slug: "mb-dist-transistor",
  name: "MB Transistor",
  category: "effect",
  type: "distortion",
  version: "1.0.0",
  description: "Aggressive transistor clipping",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "drive",
      name: "Drive",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tone",
      name: "Tone",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
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
  defaultPreset: { drive: 0.5, tone: 0.6, mix: 1 },
};

export default MbDistTransistorPlugin;
