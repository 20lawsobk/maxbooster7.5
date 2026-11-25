import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGateDrumPlugin: PluginDefinition = {
  id: "mb-gate-drum",
  slug: "mb-gate-drum",
  name: "MB Drum Gate",
  category: "effect",
  type: "gate",
  version: "1.0.0",
  description: "Fast drum gating",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -25,
      minValue: -60,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "attack",
      name: "Attack",
      type: "float",
      defaultValue: 0.1,
      minValue: 0.01,
      maxValue: 10,
      automatable: true,
    },
    {
      id: "hold",
      name: "Hold",
      type: "float",
      defaultValue: 30,
      minValue: 1,
      maxValue: 200,
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
  ],
  defaultPreset: { threshold: -25, attack: 0.1, hold: 30, release: 50 },
};

export default MbGateDrumPlugin;
