import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWtCinematicPlugin: PluginDefinition = {
  id: "mb-wt-cinematic",
  slug: "mb-wt-cinematic",
  name: "MB Cinematic WT",
  category: "instrument",
  type: "wavetable",
  version: "1.0.0",
  description: "Epic cinematic wavetable",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sawtooth", detune: 0, gain: 0.6 }],
  envelope: { attack: 1.5, decay: 1.0, sustain: 0.85, release: 2.5 },
  parameters: [
    {
      id: "position",
      name: "Wave Position",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "epic",
      name: "Epic",
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
      defaultValue: 0.75,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { position: 0.3, epic: 0.8, volume: 0.75 },
};

export default MbWtCinematicPlugin;
