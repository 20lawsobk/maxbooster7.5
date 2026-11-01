import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDistFuzzPlugin: PluginDefinition = {
  id: "mb-dist-fuzz",
  slug: "mb-dist-fuzz",
  name: "MB Fuzz",
  category: "effect",
  type: "distortion",
  version: "1.0.0",
  description: "Vintage fuzz pedal",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "fuzz",
      name: "Fuzz",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tone",
      name: "Tone",
      type: "float",
      defaultValue: 0.4,
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
  defaultPreset: { fuzz: 0.7, tone: 0.4, mix: 1 },
};

export default MbDistFuzzPlugin;
