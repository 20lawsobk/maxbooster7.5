import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicDiziPlugin: PluginDefinition = {
  id: "mb-ethnic-dizi",
  slug: "mb-ethnic-dizi",
  name: "MB Dizi",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Chinese bamboo flute with membrane buzz",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.45 },
    { type: "triangle", detune: 0, gain: 0.3 },
    { type: "noise", detune: 0, gain: 0.15 },
    { type: "square", detune: 0, gain: 0.1 },
  ],
  envelope: { attack: 0.04, decay: 0.2, sustain: 0.85, release: 0.12 },
  parameters: [
    {
      id: "membrane",
      name: "Membrane Buzz",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "breath",
      name: "Breath",
      type: "float",
      defaultValue: 0.5,
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
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { membrane: 0.5, breath: 0.5, vibrato: 0.4, volume: 0.8 },
};

export default MbEthnicDiziPlugin;
