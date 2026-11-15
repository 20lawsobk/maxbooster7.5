import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMasterChainPlugin: PluginDefinition = {
  id: "mb-master-chain",
  slug: "mb-master-chain",
  name: "MB Master Chain",
  category: "effect",
  type: "mastering" as any,
  version: "1.0.0",
  description: "All-in-one mastering chain with EQ, compression, and limiting",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "eqLow",
      name: "EQ Low",
      type: "float",
      defaultValue: 0,
      minValue: -6,
      maxValue: 6,
      automatable: true,
    },
    {
      id: "eqHigh",
      name: "EQ High",
      type: "float",
      defaultValue: 0,
      minValue: -6,
      maxValue: 6,
      automatable: true,
    },
    {
      id: "compThreshold",
      name: "Comp Threshold",
      type: "float",
      defaultValue: -12,
      minValue: -30,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "limCeiling",
      name: "Limiter Ceiling",
      type: "float",
      defaultValue: -0.3,
      minValue: -3,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "output",
      name: "Output",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
  ],
  defaultPreset: {
    eqLow: 0,
    eqHigh: 0,
    compThreshold: -12,
    limCeiling: -0.3,
    output: 0,
  },
};

export default MbMasterChainPlugin;
