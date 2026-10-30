import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPianoFeltPlugin: PluginDefinition = {
  id: "mb-piano-felt",
  slug: "mb-piano-felt",
  name: "MB Felt Piano",
  category: "instrument",
  type: "piano",
  version: "1.0.0",
  description: "Soft felt-dampened intimate piano",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.7 },
    { type: "triangle", detune: 0, gain: 0.3 },
  ],
  envelope: { attack: 0.01, decay: 0.6, sustain: 0.4, release: 1.2 },
  parameters: [
    {
      id: "softness",
      name: "Softness",
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
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { softness: 0.8, volume: 0.6 },
};

export default MbPianoFeltPlugin;
