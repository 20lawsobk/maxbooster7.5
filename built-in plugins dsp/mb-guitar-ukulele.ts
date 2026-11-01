import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGuitarUkulelePlugin: PluginDefinition = {
  id: "mb-guitar-ukulele",
  slug: "mb-guitar-ukulele",
  name: "MB Ukulele",
  category: "instrument",
  type: "guitar" as any,
  version: "1.0.0",
  description: "Cheerful ukulele with bright island vibe",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.5 },
    { type: "sine", detune: 1200, gain: 0.3 },
    { type: "sine", detune: 0, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 0.3, sustain: 0.2, release: 0.25 },
  parameters: [
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
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "strum",
      name: "Strum Width",
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
  defaultPreset: { brightness: 0.7, body: 0.5, strum: 0.4, volume: 0.8 },
};

export default MbGuitarUkulelePlugin;
