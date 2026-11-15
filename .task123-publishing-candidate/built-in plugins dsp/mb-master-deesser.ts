import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMasterDeesserPlugin: PluginDefinition = {
  id: "mb-master-deesser",
  slug: "mb-master-deesser",
  name: "MB Master De-Esser",
  category: "effect",
  type: "mastering" as any,
  version: "1.0.0",
  description: "Broadband de-esser optimized for mix bus sibilance control",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "frequency",
      name: "Frequency",
      type: "float",
      defaultValue: 6000,
      minValue: 2000,
      maxValue: 12000,
      automatable: true,
    },
    {
      id: "threshold",
      name: "Threshold",
      type: "float",
      defaultValue: -20,
      minValue: -40,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "range",
      name: "Range",
      type: "float",
      defaultValue: -6,
      minValue: -24,
      maxValue: 0,
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
  defaultPreset: { frequency: 6000, threshold: -20, range: -6, mix: 1 },
};

export default MbMasterDeesserPlugin;
