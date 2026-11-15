import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPianoUprightPlugin: PluginDefinition = {
  id: "mb-piano-upright",
  slug: "mb-piano-upright",
  name: "MB Upright Piano",
  category: "instrument",
  type: "piano",
  version: "1.0.0",
  description: "Classic upright piano with warm character",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.5 },
    { type: "sine", detune: 2, gain: 0.4 },
  ],
  envelope: { attack: 0.003, decay: 0.25, sustain: 0.5, release: 0.4 },
  parameters: [
    {
      id: "warmth",
      name: "Warmth",
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
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { warmth: 0.6, volume: 0.8 },
};

export default MbPianoUprightPlugin;
