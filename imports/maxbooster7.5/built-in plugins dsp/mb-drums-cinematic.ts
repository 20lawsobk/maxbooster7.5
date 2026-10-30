import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsCinematicPlugin: PluginDefinition = {
  id: "mb-drums-cinematic",
  slug: "mb-drums-cinematic",
  name: "MB Cinematic Drums",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "Epic cinematic percussion",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.8 },
    { type: "noise", detune: 0, gain: 0.4 },
  ],
  envelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 1.0 },
  parameters: [
    {
      id: "impact",
      name: "Impact",
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
  defaultPreset: { impact: 0.9, volume: 0.8 },
};

export default MbDrumsCinematicPlugin;
