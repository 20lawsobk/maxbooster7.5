import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMicIsolationPlugin: PluginDefinition = {
  id: "mb-mic-isolation",
  slug: "mb-mic-isolation",
  name: "MB Mic Isolator",
  category: "effect",
  type: "microphone",
  version: "1.0.0",
  description: "Background noise isolation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -40,
      minValue: -80,
      maxValue: -10,
      automatable: true,
    },
    {
      id: "reduction",
      name: "Reduction",
      type: "float",
      defaultValue: 20,
      minValue: 0,
      maxValue: 60,
      automatable: true,
    },
    {
      id: "attack",
      name: "Attack",
      type: "float",
      defaultValue: 5,
      minValue: 0.1,
      maxValue: 50,
      automatable: true,
    },
  ],
  defaultPreset: { threshold: -40, reduction: 20, attack: 5 },
};

export default MbMicIsolationPlugin;
