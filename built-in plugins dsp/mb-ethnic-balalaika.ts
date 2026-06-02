import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicBalalaikaPlugin: PluginDefinition = {
  id: "mb-ethnic-balalaika",
  slug: "mb-ethnic-balalaika",
  name: "MB Balalaika",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Russian triangular balalaika with bright strumming",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: -3, gain: 0.4 },
    { type: "triangle", detune: 3, gain: 0.4 },
    { type: "sine", detune: 1200, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 0.35, sustain: 0.15, release: 0.25 },
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
      id: "tremolo",
      name: "Tremolo",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "body",
      name: "Body",
      type: "float",
      defaultValue: 0.4,
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
  defaultPreset: { brightness: 0.7, tremolo: 0.5, body: 0.4, volume: 0.8 },
};

export default MbEthnicBalalaikaPlugin;
