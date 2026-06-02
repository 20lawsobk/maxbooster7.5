import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMalletGlockenspielPlugin: PluginDefinition = {
  id: "mb-mallet-glockenspiel",
  slug: "mb-mallet-glockenspiel",
  name: "MB Glockenspiel",
  category: "instrument",
  type: "mallet" as any,
  version: "1.0.0",
  description: "Sparkling metal glockenspiel with bell-like tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.5 },
    { type: "sine", detune: 2400, gain: 0.3 },
    { type: "sine", detune: 3600, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 1.2, sustain: 0.0, release: 0.8 },
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
      id: "sustain_time",
      name: "Sustain",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mallet",
      name: "Mallet",
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
    sustain_time: 0.6,
    mallet: 0.6,
    volume: 0.7,
  },
};

export default MbMalletGlockenspielPlugin;
