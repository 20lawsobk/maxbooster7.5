import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsPlugin: PluginDefinition = {
  id: "mb-drums",
  slug: "mb-drums",
  name: "MB Drums",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "Punchy drum kit with multiple kits and samples",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 1.0 },
    { type: "noise", detune: 0, gain: 0.5 },
  ],
  envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.3 },
  parameters: [
    {
      id: "punch",
      name: "Punch",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tone",
      name: "Tone",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "room",
      name: "Room",
      type: "float",
      defaultValue: 0.2,
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
  defaultPreset: { punch: 0.7, tone: 0.5, room: 0.2, volume: 0.8 },
};

export default MbDrumsPlugin;
