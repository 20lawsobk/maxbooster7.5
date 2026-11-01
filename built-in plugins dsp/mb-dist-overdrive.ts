import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDistOverdrivePlugin: PluginDefinition = {
  id: "mb-dist-overdrive",
  slug: "mb-dist-overdrive",
  name: "MB Overdrive",
  category: "effect",
  type: "distortion",
  version: "1.0.0",
  description: "Smooth overdrive",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "drive",
      name: "Drive",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tone",
      name: "Tone",
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
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { drive: 0.4, tone: 0.5, mix: 1 },
};

export default MbDistOverdrivePlugin;
