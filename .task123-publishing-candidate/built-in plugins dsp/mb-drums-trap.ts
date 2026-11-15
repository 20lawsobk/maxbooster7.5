import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsTrapPlugin: PluginDefinition = {
  id: "mb-drums-trap",
  slug: "mb-drums-trap",
  name: "MB Trap Kit",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "Modern trap drums with 808 bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 1.0 },
    { type: "noise", detune: 0, gain: 0.3 },
  ],
  envelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.6 },
  parameters: [
    {
      id: "slide",
      name: "Slide",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.9,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { slide: 0.5, volume: 0.9 },
};

export default MbDrumsTrapPlugin;
