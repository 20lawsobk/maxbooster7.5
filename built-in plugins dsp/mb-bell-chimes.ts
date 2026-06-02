import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBellChimesPlugin: PluginDefinition = {
  id: "mb-bell-chimes",
  slug: "mb-bell-chimes",
  name: "MB Wind Chimes",
  category: "instrument",
  type: "bell" as any,
  version: "1.0.0",
  description: "Shimmering wind chimes with random tinkling",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.35 },
    { type: "sine", detune: 1500, gain: 0.25 },
    { type: "sine", detune: 2800, gain: 0.2 },
    { type: "sine", detune: 3900, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 1.5, sustain: 0.0, release: 1.0 },
  parameters: [
    {
      id: "density",
      name: "Density",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "damping",
      name: "Damping",
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
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { density: 0.5, brightness: 0.7, damping: 0.4, volume: 0.7 },
};

export default MbBellChimesPlugin;
