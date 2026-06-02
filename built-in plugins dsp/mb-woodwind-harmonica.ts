import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWoodwindHarmonicaPlugin: PluginDefinition = {
  id: "mb-woodwind-harmonica",
  slug: "mb-woodwind-harmonica",
  name: "MB Harmonica",
  category: "instrument",
  type: "woodwind" as any,
  version: "1.0.0",
  description: "Blues harmonica with bend and overdraw",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: 0, gain: 0.4 },
    { type: "sawtooth", detune: 3, gain: 0.3 },
    { type: "triangle", detune: 0, gain: 0.3 },
  ],
  envelope: { attack: 0.01, decay: 0.15, sustain: 0.9, release: 0.08 },
  parameters: [
    {
      id: "bend",
      name: "Bend",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
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
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { bend: 0, vibrato: 0.4, brightness: 0.6, volume: 0.8 },
};

export default MbWoodwindHarmonicaPlugin;
