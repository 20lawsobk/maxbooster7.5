import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCreativePitchshiftPlugin: PluginDefinition = {
  id: "mb-creative-pitchshift",
  slug: "mb-creative-pitchshift",
  name: "MB Pitch Shifter Pro",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Real-time pitch shifting with formant preservation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "semitones",
      name: "Semitones",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "cents",
      name: "Fine Tune",
      type: "float",
      defaultValue: 0,
      minValue: -100,
      maxValue: 100,
      automatable: true,
    },
    {
      id: "formant",
      name: "Formant Preserve",
      type: "float",
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automatable: false,
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
  defaultPreset: { semitones: 0, cents: 0, formant: 1, mix: 1 },
};

export default MbCreativePitchshiftPlugin;
