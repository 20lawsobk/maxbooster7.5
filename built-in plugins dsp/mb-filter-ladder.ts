import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFilterLadderPlugin: PluginDefinition = {
  id: "mb-filter-ladder",
  slug: "mb-filter-ladder",
  name: "MB Ladder Filter",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Classic Moog-style 4-pole ladder filter with self-oscillation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "cutoff",
      name: "Cutoff",
      type: "float",
      defaultValue: 2000,
      minValue: 20,
      maxValue: 20000,
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
      id: "drive",
      name: "Drive",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "envAmount",
      name: "Env Amount",
      type: "float",
      defaultValue: 0,
      minValue: -1,
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
    cutoff: 2000,
    resonance: 0.5,
    drive: 0,
    envAmount: 0,
    mix: 1,
  },
};

export default MbFilterLadderPlugin;
