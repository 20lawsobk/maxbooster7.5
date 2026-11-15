import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMalletXylophonePlugin: PluginDefinition = {
  id: "mb-mallet-xylophone",
  slug: "mb-mallet-xylophone",
  name: "MB Xylophone",
  category: "instrument",
  type: "mallet" as any,
  version: "1.0.0",
  description: "Bright wooden xylophone with sharp attack",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.5 },
    { type: "sine", detune: 2400, gain: 0.3 },
    { type: "triangle", detune: 3600, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.3 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mallet",
      name: "Mallet Hardness",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "resonance",
      name: "Resonance",
      type: "float",
      defaultValue: 0.3,
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
  defaultPreset: { brightness: 0.8, mallet: 0.7, resonance: 0.3, volume: 0.8 },
};

export default MbMalletXylophonePlugin;
