import type { PluginDefinition } from "../server/services/pluginHostService";

const MbOrganFarfisaPlugin: PluginDefinition = {
  id: "mb-organ-farfisa",
  slug: "mb-organ-farfisa",
  name: "MB Farfisa",
  category: "instrument",
  type: "organ" as any,
  version: "1.0.0",
  description: "Classic 60s Farfisa combo organ with garage rock tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: 0, gain: 0.55 },
    { type: "square", detune: 1200, gain: 0.3 },
    { type: "sawtooth", detune: 0, gain: 0.15 },
  ],
  envelope: { attack: 0.002, decay: 0.03, sustain: 0.95, release: 0.04 },
  parameters: [
    {
      id: "tabs",
      name: "Tab Mix",
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
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
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
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { tabs: 0.5, vibrato: 0.5, brightness: 0.7, volume: 0.8 },
};

export default MbOrganFarfisaPlugin;
