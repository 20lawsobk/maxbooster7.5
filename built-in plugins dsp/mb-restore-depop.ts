import type { PluginDefinition } from "../server/services/pluginHostService";

const MbRestoreDepopPlugin: PluginDefinition = {
  id: "mb-restore-depop",
  slug: "mb-restore-depop",
  name: "MB Pop Remover",
  category: "effect",
  type: "gate" as any,
  version: "1.0.0",
  description: "Detect and attenuate plosive pops from vocal recordings",
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
      id: "frequency",
      name: "Focus Frequency",
      type: "float",
      defaultValue: 100,
      minValue: 30,
      maxValue: 300,
      automatable: true,
    },
    {
      id: "reduction",
      name: "Reduction",
      type: "float",
      defaultValue: 12,
      minValue: 0,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "speed",
      name: "Recovery Speed",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: {
    sensitivity: 0.5,
    frequency: 100,
    reduction: 12,
    speed: 0.5,
  },
};

export default MbRestoreDepopPlugin;
