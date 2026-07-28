import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicTablaPlugin: PluginDefinition = {
  id: "mb-ethnic-tabla",
  slug: "mb-ethnic-tabla",
  name: "MB Tabla",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Indian tabla drum pair with tuned pitch bends",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.6 },
    { type: "noise", detune: 0, gain: 0.2 },
    { type: "triangle", detune: 0, gain: 0.2 },
  ],
  envelope: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.3 },
  parameters: [
    {
      id: "tuning",
      name: "Tuning",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "slap",
      name: "Slap",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "bend",
      name: "Pitch Bend",
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
  defaultPreset: { tuning: 0.5, slap: 0.6, bend: 0.4, volume: 0.8 },
};

export default MbEthnicTablaPlugin;
