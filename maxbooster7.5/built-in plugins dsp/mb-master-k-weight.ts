import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMasterKWeightPlugin: PluginDefinition = {
  id: "mb-master-k-weight",
  slug: "mb-master-k-weight",
  name: "MB K-Weighted Meter",
  category: "effect",
  type: "mastering" as any,
  version: "1.0.0",
  description: "K-system metering for calibrated monitoring and mastering",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "kScale",
      name: "K Scale",
      type: "float",
      defaultValue: 14,
      minValue: 12,
      maxValue: 20,
      automatable: false,
    },
    {
      id: "holdTime",
      name: "Hold Time",
      type: "float",
      defaultValue: 2000,
      minValue: 500,
      maxValue: 5000,
      automatable: false,
    },
    {
      id: "fallRate",
      name: "Fall Rate",
      type: "float",
      defaultValue: 20,
      minValue: 5,
      maxValue: 50,
      automatable: false,
    },
  ],
  defaultPreset: { kScale: 14, holdTime: 2000, fallRate: 20 },
};

export default MbMasterKWeightPlugin;
