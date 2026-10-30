import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFmPluckPlugin: PluginDefinition = {
  id: "mb-fm-pluck",
  slug: "mb-fm-pluck",
  name: "MB FM Pluck",
  category: "instrument",
  type: "fm",
  version: "1.0.0",
  description: "Short FM pluck",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sine", detune: 0, gain: 0.8 }],
  envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.15 },
  parameters: [
    {
      id: "modIndex",
      name: "Mod Index",
      type: "float",
      defaultValue: 8,
      minValue: 0,
      maxValue: 20,
      automatable: true,
    },
    {
      id: "decay",
      name: "Decay",
      type: "float",
      defaultValue: 0.25,
      minValue: 0.05,
      maxValue: 1,
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
  defaultPreset: { modIndex: 8, decay: 0.25, volume: 0.8 },
};

export default MbFmPluckPlugin;
