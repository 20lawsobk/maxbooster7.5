import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFmMalletPlugin: PluginDefinition = {
  id: "mb-fm-mallet",
  slug: "mb-fm-mallet",
  name: "MB FM Mallet",
  category: "instrument",
  type: "fm",
  version: "1.0.0",
  description: "Marimba-like FM mallet",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sine", detune: 0, gain: 0.75 }],
  envelope: { attack: 0.001, decay: 0.6, sustain: 0.1, release: 0.4 },
  parameters: [
    {
      id: "ratio",
      name: "Ratio",
      type: "float",
      defaultValue: 4,
      minValue: 1,
      maxValue: 10,
      automatable: true,
    },
    {
      id: "modIndex",
      name: "Mod Index",
      type: "float",
      defaultValue: 3,
      minValue: 0,
      maxValue: 15,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { ratio: 4, modIndex: 3, volume: 0.8 },
};

export default MbFmMalletPlugin;
