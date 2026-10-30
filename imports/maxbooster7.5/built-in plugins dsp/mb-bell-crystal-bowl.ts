import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBellCrystalBowlPlugin: PluginDefinition = {
  id: "mb-bell-crystal-bowl",
  slug: "mb-bell-crystal-bowl",
  name: "MB Crystal Bowl",
  category: "instrument",
  type: "bell" as any,
  version: "1.0.0",
  description: "Crystal singing bowl with pure ethereal sustain",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.6 },
    { type: "sine", detune: 1200, gain: 0.25 },
    { type: "sine", detune: 2400, gain: 0.15 },
  ],
  envelope: { attack: 0.8, decay: 6.0, sustain: 0.4, release: 4.0 },
  parameters: [
    {
      id: "purity",
      name: "Purity",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "sustain_time",
      name: "Sustain",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "size",
      name: "Bowl Size",
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
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { purity: 0.8, sustain_time: 0.7, size: 0.5, volume: 0.7 },
};

export default MbBellCrystalBowlPlugin;
