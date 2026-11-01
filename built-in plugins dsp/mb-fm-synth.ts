import type { PluginDefinition } from "../server/services/pluginHostService";

const MbFmSynthPlugin: PluginDefinition = {
  id: "mb-fm-synth",
  slug: "mb-fm-synth",
  name: "MB FM Synth",
  category: "instrument",
  type: "fm",
  version: "1.0.0",
  description: "FM synthesis engine with 4 operators",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sine", detune: 0, gain: 1.0 }],
  envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.3 },
  parameters: [
    {
      id: "modIndex",
      name: "Mod Index",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "ratio",
      name: "Ratio",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
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
  defaultPreset: { modIndex: 0.5, ratio: 0.5, brightness: 0.5, volume: 0.8 },
};

export default MbFmSynthPlugin;
