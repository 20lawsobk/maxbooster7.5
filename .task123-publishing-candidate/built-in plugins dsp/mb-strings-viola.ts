import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStringsViolaPlugin: PluginDefinition = {
  id: "mb-strings-viola",
  slug: "mb-strings-viola",
  name: "MB Solo Viola",
  category: "instrument",
  type: "strings",
  version: "1.0.0",
  description: "Rich solo viola",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "triangle", detune: 2, gain: 0.5 },
  ],
  envelope: { attack: 0.08, decay: 0.4, sustain: 0.85, release: 0.5 },
  parameters: [
    {
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.4,
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
  defaultPreset: { vibrato: 0.4, volume: 0.8 },
};

export default MbStringsViolaPlugin;
