import type { PluginDefinition } from "../server/services/pluginHostService";

const MbRestoreDeclipPlugin: PluginDefinition = {
  id: "mb-restore-declip",
  slug: "mb-restore-declip",
  name: "MB De-Clip",
  category: "effect",
  type: "distortion" as any,
  version: "1.0.0",
  description: "Reconstruct clipped audio peaks for damaged recordings",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -1,
      minValue: -6,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "quality",
      name: "Quality",
      type: "float",
      defaultValue: 2,
      minValue: 0,
      maxValue: 3,
      automatable: false,
    },
    {
      id: "makeup",
      name: "Makeup Gain",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
  ],
  defaultPreset: { threshold: -1, quality: 2, makeup: 0 },
};

export default MbRestoreDeclipPlugin;
