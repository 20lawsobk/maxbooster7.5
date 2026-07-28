import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsHiphopPlugin: PluginDefinition = {
  id: "mb-drums-hiphop",
  slug: "mb-drums-hiphop",
  name: "MB Hip Hop Kit",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "Hard-hitting hip hop drums",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 1.0 },
    { type: "noise", detune: 0, gain: 0.4 },
  ],
  envelope: { attack: 0.001, decay: 0.25, sustain: 0.0, release: 0.35 },
  parameters: [
    {
      id: "thump",
      name: "Thump",
      type: "float",
      defaultValue: 0.8,
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
  defaultPreset: { thump: 0.8, volume: 0.85 },
};

export default MbDrumsHiphopPlugin;
