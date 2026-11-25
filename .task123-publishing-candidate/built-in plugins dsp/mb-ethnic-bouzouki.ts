import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicBouzoukiPlugin: PluginDefinition = {
  id: "mb-ethnic-bouzouki",
  slug: "mb-ethnic-bouzouki",
  name: "MB Bouzouki",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Greek bouzouki with metallic string character",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: -3, gain: 0.35 },
    { type: "triangle", detune: 3, gain: 0.35 },
    { type: "sawtooth", detune: 0, gain: 0.15 },
    { type: "sine", detune: 1200, gain: 0.15 },
  ],
  envelope: { attack: 0.001, decay: 0.4, sustain: 0.2, release: 0.3 },
  parameters: [
    {
      id: "tremolo",
      name: "Tremolo",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
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
  defaultPreset: { tremolo: 0.6, brightness: 0.7, body: 0.4, volume: 0.8 },
};

export default MbEthnicBouzoukiPlugin;
