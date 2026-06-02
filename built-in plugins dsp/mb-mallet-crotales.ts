import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMalletCrotalesPlugin: PluginDefinition = {
  id: "mb-mallet-crotales",
  slug: "mb-mallet-crotales",
  name: "MB Crotales",
  category: "instrument",
  type: "mallet" as any,
  version: "1.0.0",
  description: "High-pitched antique cymbals with shimmering sustain",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.4 },
    { type: "sine", detune: 2400, gain: 0.35 },
    { type: "sine", detune: 3100, gain: 0.25 },
  ],
  envelope: { attack: 0.001, decay: 2.0, sustain: 0.05, release: 1.5 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.9,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "decay_time",
      name: "Decay",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "shimmer",
      name: "Shimmer",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: {
    brightness: 0.9,
    decay_time: 0.7,
    shimmer: 0.6,
    volume: 0.7,
  },
};

export default MbMalletCrotalesPlugin;
