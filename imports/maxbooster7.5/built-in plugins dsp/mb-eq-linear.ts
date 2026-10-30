import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEqLinearPlugin: PluginDefinition = {
  id: "mb-eq-linear",
  slug: "mb-eq-linear",
  name: "MB Linear Phase EQ",
  category: "effect",
  type: "eq",
  version: "1.0.0",
  description: "Zero-latency linear phase EQ",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "lowGain",
      name: "Low",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "midGain",
      name: "Mid",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "highGain",
      name: "High",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
  ],
  defaultPreset: { lowGain: 0, midGain: 0, highGain: 0 },
};

export default MbEqLinearPlugin;
