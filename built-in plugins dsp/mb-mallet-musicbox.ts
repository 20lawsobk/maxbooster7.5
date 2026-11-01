import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMalletMusicboxPlugin: PluginDefinition = {
  id: "mb-mallet-musicbox",
  slug: "mb-mallet-musicbox",
  name: "MB Music Box",
  category: "instrument",
  type: "mallet" as any,
  version: "1.0.0",
  description: "Delicate music box with tinkling mechanical tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.6 },
    { type: "sine", detune: 2400, gain: 0.25 },
    { type: "sine", detune: 3600, gain: 0.15 },
  ],
  envelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.4 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.85,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mechanical",
      name: "Mechanical",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "reverb",
      name: "Reverb",
      type: "float",
      defaultValue: 0.3,
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
    brightness: 0.85,
    mechanical: 0.4,
    reverb: 0.3,
    volume: 0.7,
  },
};

export default MbMalletMusicboxPlugin;
