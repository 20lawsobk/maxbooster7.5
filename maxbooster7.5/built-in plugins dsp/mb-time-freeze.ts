import type { PluginDefinition } from "../server/services/pluginHostService";

const MbTimeFreezePlugin: PluginDefinition = {
  id: "mb-time-freeze",
  slug: "mb-time-freeze",
  name: "MB Spectral Freeze",
  category: "effect",
  type: "delay" as any,
  version: "1.0.0",
  description: "Freeze audio in time creating sustained spectral textures",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "freeze",
      name: "Freeze",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "blur",
      name: "Blur",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "shift",
      name: "Spectral Shift",
      type: "float",
      defaultValue: 0,
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
  defaultPreset: { freeze: 0, blur: 0.5, shift: 0, mix: 0.5 },
};

export default MbTimeFreezePlugin;
