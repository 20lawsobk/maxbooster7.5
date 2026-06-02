import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWoodwindBassoonPlugin: PluginDefinition = {
  id: "mb-woodwind-bassoon",
  slug: "mb-woodwind-bassoon",
  name: "MB Bassoon",
  category: "instrument",
  type: "woodwind" as any,
  version: "1.0.0",
  description: "Deep bassoon with dark reedy character",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.45 },
    { type: "square", detune: 0, gain: 0.3 },
    { type: "sine", detune: -1200, gain: 0.25 },
  ],
  envelope: { attack: 0.06, decay: 0.3, sustain: 0.82, release: 0.18 },
  parameters: [
    {
      id: "reed",
      name: "Reed",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "body",
      name: "Body",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "vibrato",
      name: "Vibrato",
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
  defaultPreset: { reed: 0.5, body: 0.7, vibrato: 0.2, volume: 0.8 },
};

export default MbWoodwindBassoonPlugin;
