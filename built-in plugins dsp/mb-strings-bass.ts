import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStringsBassPlugin: PluginDefinition = {
  id: "mb-strings-bass",
  slug: "mb-strings-bass",
  name: "MB Contrabass",
  category: "instrument",
  type: "strings",
  version: "1.0.0",
  description: "Deep orchestral contrabass",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "sine", detune: -1200, gain: 0.5 },
  ],
  envelope: { attack: 0.15, decay: 0.5, sustain: 0.7, release: 0.8 },
  parameters: [
    {
      id: "body",
      name: "Body",
      type: "float",
      defaultValue: 0.7,
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
  defaultPreset: { body: 0.7, volume: 0.8 },
};

export default MbStringsBassPlugin;
