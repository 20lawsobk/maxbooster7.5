import type { PluginDefinition } from "../server/services/pluginHostService";

const MbEthnicZurnaPlugin: PluginDefinition = {
  id: "mb-ethnic-zurna",
  slug: "mb-ethnic-zurna",
  name: "MB Zurna",
  category: "instrument",
  type: "ethnic" as any,
  version: "1.0.0",
  description: "Turkish double-reed oboe with piercing outdoor tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "square", detune: 3, gain: 0.3 },
    { type: "sine", detune: 1200, gain: 0.2 },
  ],
  envelope: { attack: 0.02, decay: 0.15, sustain: 0.92, release: 0.1 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "reed",
      name: "Reed",
      type: "float",
      defaultValue: 0.6,
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
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { brightness: 0.8, reed: 0.6, vibrato: 0.3, volume: 0.7 },
};

export default MbEthnicZurnaPlugin;
