import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicMbiraPlugin: PluginDefinition = {
  id: "mb-ethnic-mbira",
  slug: "mb-ethnic-mbira",
  name: "MB Mbira",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Zimbabwean mbira (thumb piano) with gourd resonance",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.5 },
    { type: "triangle", detune: 0, gain: 0.3 },
    { type: "sine", detune: 2400, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 0.9, sustain: 0.1, release: 0.5 },
  parameters: [
    {
      id: "buzz",
      name: "Shell Buzz",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "gourd",
      name: "Gourd Resonance",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
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
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { buzz: 0.4, gourd: 0.5, brightness: 0.5, volume: 0.8 },
};

export default MbEthnicMbiraPlugin;
