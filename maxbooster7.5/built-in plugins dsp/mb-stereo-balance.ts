import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStereoBalancePlugin: PluginDefinition = {
  id: "mb-stereo-balance",
  slug: "mb-stereo-balance",
  name: "MB Stereo Balance",
  category: "effect",
  type: "stereo" as any,
  version: "1.0.0",
  description: "Frequency-dependent stereo balance correction",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "balance",
      name: "Balance",
      type: "float",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "lowBalance",
      name: "Low Balance",
      type: "float",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "highBalance",
      name: "High Balance",
      type: "float",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "crossover",
      name: "Crossover",
      type: "float",
      defaultValue: 1000,
      minValue: 200,
      maxValue: 5000,
      automatable: true,
    },
  ],
  defaultPreset: { balance: 0, lowBalance: 0, highBalance: 0, crossover: 1000 },
};

export default MbStereoBalancePlugin;
