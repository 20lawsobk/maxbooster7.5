import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMalletVibraphonePlugin: PluginDefinition = {
  id: "mb-mallet-vibraphone",
  slug: "mb-mallet-vibraphone",
  name: "MB Vibraphone",
  category: "instrument",
  type: "mallet" as any,
  version: "1.0.0",
  description: "Jazz vibraphone with motor vibrato and pedal",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.6 },
    { type: "sine", detune: 1200, gain: 0.25 },
    { type: "triangle", detune: 2400, gain: 0.15 },
  ],
  envelope: { attack: 0.001, decay: 1.5, sustain: 0.2, release: 1.0 },
  parameters: [
    {
      id: "motor",
      name: "Motor Speed",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "damper",
      name: "Damper Pedal",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mallet",
      name: "Mallet Hardness",
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
  defaultPreset: { motor: 0.5, damper: 0.5, mallet: 0.5, volume: 0.8 },
};

export default MbMalletVibraphonePlugin;
