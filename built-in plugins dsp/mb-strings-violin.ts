import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStringsViolinPlugin: PluginDefinition = {
  id: "mb-strings-violin",
  slug: "mb-strings-violin",
  name: "MB Solo Violin",
  category: "instrument",
  type: "strings",
  version: "1.0.0",
  description: "Expressive solo violin",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.6 },
    { type: "triangle", detune: 3, gain: 0.4 },
  ],
  envelope: { attack: 0.05, decay: 0.3, sustain: 0.9, release: 0.4 },
  parameters: [
    {
      id: "vibrato",
      name: "Vibrato",
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
  defaultPreset: { vibrato: 0.5, volume: 0.8 },
};

export default MbStringsViolinPlugin;
