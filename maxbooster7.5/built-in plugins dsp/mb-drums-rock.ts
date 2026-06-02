import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsRockPlugin: PluginDefinition = {
  id: "mb-drums-rock",
  slug: "mb-drums-rock",
  name: "MB Rock Kit",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "Powerful rock drum kit",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.9 },
    { type: "noise", detune: 0, gain: 0.6 },
  ],
  envelope: { attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.25 },
  parameters: [
    {
      id: "attack",
      name: "Attack",
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
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { attack: 0.9, volume: 0.8 },
};

export default MbDrumsRockPlugin;
