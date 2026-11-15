import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPianoToyPlugin: PluginDefinition = {
  id: "mb-piano-toy",
  slug: "mb-piano-toy",
  name: "MB Toy Piano",
  category: "instrument",
  type: "piano",
  version: "1.0.0",
  description: "Bright toy piano with metallic tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 1200, gain: 0.4 },
    { type: "triangle", detune: 0, gain: 0.6 },
  ],
  envelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.3 },
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
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { brightness: 0.9, volume: 0.7 },
};

export default MbPianoToyPlugin;
