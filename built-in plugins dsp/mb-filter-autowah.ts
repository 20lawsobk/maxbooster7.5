import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFilterAutowahPlugin: PluginDefinition = {
  id: "mb-filter-autowah",
  slug: "mb-filter-autowah",
  name: "MB Auto-Wah",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Envelope-following auto-wah effect",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "sensitivity",
      name: "Sensitivity",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "speed",
      name: "Speed",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "depth",
      name: "Depth",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "resonance",
      name: "Resonance",
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
  defaultPreset: {
    sensitivity: 0.5,
    speed: 0.5,
    depth: 0.7,
    resonance: 0.5,
    mix: 1,
  },
};

export default MbFilterAutowahPlugin;
