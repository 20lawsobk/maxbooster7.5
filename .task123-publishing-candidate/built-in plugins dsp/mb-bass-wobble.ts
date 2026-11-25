import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBassWobblePlugin: PluginDefinition = {
  id: "mb-bass-wobble",
  slug: "mb-bass-wobble",
  name: "MB Wobble Bass",
  category: "instrument",
  type: "bass",
  version: "1.0.0",
  description: "Dubstep wobble bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.6 },
    { type: "square", detune: 0, gain: 0.4 },
  ],
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.2 },
  parameters: [
    {
      id: "lfoRate",
      name: "LFO Rate",
      type: "float",
      defaultValue: 4,
      minValue: 0.5,
      maxValue: 20,
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
  defaultPreset: { lfoRate: 4, volume: 0.8 },
};

export default MbBassWobblePlugin;
