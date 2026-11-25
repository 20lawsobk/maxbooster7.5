import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicSitarPlugin: PluginDefinition = {
  id: "mb-ethnic-sitar",
  slug: "mb-ethnic-sitar",
  name: "MB Sitar",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Indian sitar with sympathetic string resonance",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.4 },
    { type: "triangle", detune: 0, gain: 0.3 },
    { type: "sine", detune: 5, gain: 0.3 },
  ],
  envelope: { attack: 0.001, decay: 1.0, sustain: 0.3, release: 0.8 },
  parameters: [
    {
      id: "sympathetic",
      name: "Sympathetic Strings",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "buzz",
      name: "Jawari Buzz",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "bend",
      name: "Meend (Bend)",
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
  defaultPreset: { sympathetic: 0.5, buzz: 0.6, bend: 0.4, volume: 0.8 },
};

export default MbEthnicSitarPlugin;
