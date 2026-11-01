import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGateNoisePlugin: PluginDefinition = {
  id: "mb-gate-noise",
  slug: "mb-gate-noise",
  name: "MB Noise Gate",
  category: "effect",
  type: "gate",
  version: "1.0.0",
  description: "Clean noise removal",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -40,
      minValue: -80,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "attack",
      name: "Attack",
      type: "float",
      defaultValue: 1,
      minValue: 0.01,
      maxValue: 50,
      automatable: true,
    },
    {
      id: "release",
      name: "Release",
      type: "float",
      defaultValue: 100,
      minValue: 10,
      maxValue: 2000,
      automatable: true,
    },
  ],
  defaultPreset: { threshold: -40, attack: 1, release: 100 },
};

export default MbGateNoisePlugin;
