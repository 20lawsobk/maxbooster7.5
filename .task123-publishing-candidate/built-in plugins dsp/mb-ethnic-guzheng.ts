import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicGuzhengPlugin: PluginDefinition = {
  id: "mb-ethnic-guzheng",
  slug: "mb-ethnic-guzheng",
  name: "MB Guzheng",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Chinese zither with glissando and bend articulation",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.5 },
    { type: "sine", detune: 0, gain: 0.3 },
    { type: "sine", detune: 1200, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 1.0, sustain: 0.2, release: 0.6 },
  parameters: [
    {
      id: "bend",
      name: "Bend",
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
      defaultValue: 0.3,
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
  defaultPreset: { bend: 0.4, vibrato: 0.3, brightness: 0.6, volume: 0.8 },
};

export default MbEthnicGuzhengPlugin;
