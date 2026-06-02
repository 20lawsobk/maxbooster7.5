import type { PluginDefinition } from "../server/services/pluginHostService";

const MbCreativeVocoderPlugin: PluginDefinition = {
  id: "mb-creative-vocoder",
  slug: "mb-creative-vocoder",
  name: "MB Vocoder",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description:
    "Classic vocoder with adjustable band count and formant tracking",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "bands",
      name: "Bands",
      type: "float",
      defaultValue: 16,
      minValue: 4,
      maxValue: 32,
      automatable: false,
    },
    {
      id: "formant",
      name: "Formant Shift",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "attack",
      name: "Attack",
      type: "float",
      defaultValue: 10,
      minValue: 1,
      maxValue: 100,
      automatable: true,
    },
    {
      id: "release",
      name: "Release",
      type: "float",
      defaultValue: 50,
      minValue: 5,
      maxValue: 500,
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
  defaultPreset: { bands: 16, formant: 0, attack: 10, release: 50, mix: 1 },
};

export default MbCreativeVocoderPlugin;
