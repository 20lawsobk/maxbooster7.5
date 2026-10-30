import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWoodwindFlutePlugin: PluginDefinition = {
  id: "mb-woodwind-flute",
  slug: "mb-woodwind-flute",
  name: "MB Flute",
  category: "instrument",
  type: "woodwind" as any,
  version: "1.0.0",
  description: "Concert flute with pure airy tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.6 },
    { type: "triangle", detune: 0, gain: 0.3 },
    { type: "noise", detune: 0, gain: 0.1 },
  ],
  envelope: { attack: 0.05, decay: 0.2, sustain: 0.85, release: 0.15 },
  parameters: [
    {
      id: "breath",
      name: "Breath",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.35,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "air",
      name: "Air Noise",
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
  defaultPreset: { breath: 0.4, vibrato: 0.35, air: 0.2, volume: 0.8 },
};

export default MbWoodwindFlutePlugin;
