import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFilterHpPlugin: PluginDefinition = {
  id: "mb-filter-hp",
  slug: "mb-filter-hp",
  name: "MB High-Pass Filter",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Resonant high-pass filter for cleaning low end",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "cutoff",
      name: "Cutoff",
      type: "float",
      defaultValue: 80,
      minValue: 20,
      maxValue: 20000,
      automatable: true,
    },
    {
      id: "resonance",
      name: "Resonance",
      type: "float",
      defaultValue: 0.2,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "slope",
      name: "Slope",
      type: "float",
      defaultValue: 12,
      minValue: 6,
      maxValue: 48,
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
  defaultPreset: { cutoff: 80, resonance: 0.2, slope: 12, mix: 1 },
};

export default MbFilterHpPlugin;
