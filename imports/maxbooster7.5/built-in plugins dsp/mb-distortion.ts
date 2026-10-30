import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDistortionPlugin: PluginDefinition = {
  id: "mb-distortion",
  slug: "mb-distortion",
  name: "MB Distortion",
  category: "effect",
  type: "distortion",
  version: "1.0.0",
  description: "Multi-mode distortion with tube, tape, and digital saturation",
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
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "output",
      name: "Output Level",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 1.0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "bias",
      name: "Bias",
      type: "float",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { drive: 0.5, tone: 0.5, output: 0, mix: 1.0, bias: 0 },
};

export default MbDistortionPlugin;
