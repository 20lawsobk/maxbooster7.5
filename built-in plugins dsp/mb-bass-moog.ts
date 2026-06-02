import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBassMoogPlugin: PluginDefinition = {
  id: "mb-bass-moog",
  slug: "mb-bass-moog",
  name: "MB Moog Bass",
  category: "instrument",
  type: "bass",
  version: "1.0.0",
  description: "Classic Moog-style bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.7 },
    { type: "square", detune: -1200, gain: 0.3 },
  ],
  envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2 },
  parameters: [
    {
      id: "filter",
      name: "Filter",
      type: "float",
      defaultValue: 3000,
      minValue: 100,
      maxValue: 10000,
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
  defaultPreset: { filter: 3000, volume: 0.8 },
};

export default MbBassMoogPlugin;
