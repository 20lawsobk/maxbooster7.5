import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPadDarkPlugin: PluginDefinition = {
  id: "mb-pad-dark",
  slug: "mb-pad-dark",
  name: "MB Dark Pad",
  category: "instrument",
  type: "pad",
  version: "1.0.0",
  description: "Moody dark atmosphere",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -12, gain: 0.3 },
    { type: "sawtooth", detune: 12, gain: 0.3 },
    { type: "sine", detune: -1200, gain: 0.4 },
  ],
  envelope: { attack: 1.5, decay: 1.0, sustain: 0.8, release: 3.0 },
  parameters: [
    {
      id: "darkness",
      name: "Darkness",
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
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { darkness: 0.8, volume: 0.7 },
};

export default MbPadDarkPlugin;
