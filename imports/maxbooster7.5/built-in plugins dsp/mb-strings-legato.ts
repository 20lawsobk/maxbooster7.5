import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStringsLegatoPlugin: PluginDefinition = {
  id: "mb-strings-legato",
  slug: "mb-strings-legato",
  name: "MB Legato Strings",
  category: "instrument",
  type: "strings",
  version: "1.0.0",
  description: "Smooth connected legato strings",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -7, gain: 0.25 },
    { type: "sawtooth", detune: 7, gain: 0.25 },
    { type: "triangle", detune: 0, gain: 0.5 },
  ],
  envelope: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 1.5 },
  parameters: [
    {
      id: "glide",
      name: "Glide",
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
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { glide: 0.3, volume: 0.8 },
};

export default MbStringsLegatoPlugin;
