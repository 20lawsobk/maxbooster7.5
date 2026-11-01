import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBassSlapPlugin: PluginDefinition = {
  id: "mb-bass-slap",
  slug: "mb-bass-slap",
  name: "MB Slap Bass",
  category: "instrument",
  type: "bass",
  version: "1.0.0",
  description: "Funky slap bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "triangle", detune: 0, gain: 0.5 },
  ],
  envelope: { attack: 0.001, decay: 0.2, sustain: 0.3, release: 0.2 },
  parameters: [
    {
      id: "snap",
      name: "Snap",
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
  defaultPreset: { snap: 0.8, volume: 0.8 },
};

export default MbBassSlapPlugin;
