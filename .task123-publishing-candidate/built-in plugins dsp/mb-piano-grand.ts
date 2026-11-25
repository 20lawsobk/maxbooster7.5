import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPianoGrandPlugin: PluginDefinition = {
  id: "mb-piano-grand",
  slug: "mb-piano-grand",
  name: "MB Grand Piano",
  category: "instrument",
  type: "piano",
  version: "1.0.0",
  description: "Concert grand piano with rich harmonics",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.6 },
    { type: "sine", detune: 0.5, gain: 0.3 },
    { type: "sine", detune: 1200, gain: 0.1 },
  ],
  envelope: { attack: 0.002, decay: 0.3, sustain: 0.6, release: 0.5 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "dynamics",
      name: "Dynamics",
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
  defaultPreset: { brightness: 0.5, dynamics: 0.7, volume: 0.8 },
};

export default MbPianoGrandPlugin;
