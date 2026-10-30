import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMalletDulcimerPlugin: PluginDefinition = {
  id: "mb-mallet-dulcimer",
  slug: "mb-mallet-dulcimer",
  name: "MB Hammered Dulcimer",
  category: "instrument",
  type: "mallet" as any,
  version: "1.0.0",
  description: "Hammered dulcimer with ringing sustain",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: -2, gain: 0.35 },
    { type: "triangle", detune: 2, gain: 0.35 },
    { type: "sine", detune: 1200, gain: 0.3 },
  ],
  envelope: { attack: 0.001, decay: 1.0, sustain: 0.15, release: 0.5 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "resonance",
      name: "Resonance",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "damper",
      name: "Damper",
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
  defaultPreset: { brightness: 0.6, resonance: 0.5, damper: 0.3, volume: 0.8 },
};

export default MbMalletDulcimerPlugin;
