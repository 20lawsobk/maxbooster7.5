import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStringsSpiccatoPlugin: PluginDefinition = {
  id: "mb-strings-spiccato",
  slug: "mb-strings-spiccato",
  name: "MB Spiccato",
  category: "instrument",
  type: "strings",
  version: "1.0.0",
  description: "Short bouncing bow articulation",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.6 },
    { type: "triangle", detune: 0, gain: 0.4 },
  ],
  envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.15 },
  parameters: [
    {
      id: "attack",
      name: "Attack",
      type: "float",
      defaultValue: 0.8,
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
  defaultPreset: { attack: 0.8, volume: 0.8 },
};

export default MbStringsSpiccatoPlugin;
