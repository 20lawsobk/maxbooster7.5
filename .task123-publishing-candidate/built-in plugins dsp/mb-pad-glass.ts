import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPadGlassPlugin: PluginDefinition = {
  id: "mb-pad-glass",
  slug: "mb-pad-glass",
  name: "MB Glass Pad",
  category: "instrument",
  type: "pad",
  version: "1.0.0",
  description: "Crystalline glass textures",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.4 },
    { type: "sine", detune: 1200, gain: 0.3 },
    { type: "sine", detune: 2400, gain: 0.2 },
    { type: "sine", detune: 3600, gain: 0.1 },
  ],
  envelope: { attack: 0.3, decay: 0.8, sustain: 0.7, release: 2.0 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
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
      defaultValue: 0.65,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { brightness: 0.7, volume: 0.65 },
};

export default MbPadGlassPlugin;
