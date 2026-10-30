import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStringsCinematicPlugin: PluginDefinition = {
  id: "mb-strings-cinematic",
  slug: "mb-strings-cinematic",
  name: "MB Cinematic Strings",
  category: "instrument",
  type: "strings",
  version: "1.0.0",
  description: "Epic cinematic string orchestra",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -10, gain: 0.2 },
    { type: "sawtooth", detune: 10, gain: 0.2 },
    { type: "sawtooth", detune: 0, gain: 0.3 },
    { type: "triangle", detune: 0, gain: 0.3 },
  ],
  envelope: { attack: 0.8, decay: 0.5, sustain: 0.85, release: 2.0 },
  parameters: [
    {
      id: "width",
      name: "Width",
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
  defaultPreset: { width: 0.8, volume: 0.8 },
};

export default MbStringsCinematicPlugin;
