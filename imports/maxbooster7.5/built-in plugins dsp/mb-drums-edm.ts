import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsEdmPlugin: PluginDefinition = {
  id: "mb-drums-edm",
  slug: "mb-drums-edm",
  name: "MB EDM Kit",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "High-energy EDM drums",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.9 },
    { type: "noise", detune: 0, gain: 0.7 },
  ],
  envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.15 },
  parameters: [
    {
      id: "punch",
      name: "Punch",
      type: "float",
      defaultValue: 0.95,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.85,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { punch: 0.95, volume: 0.85 },
};

export default MbDrumsEdmPlugin;
