import type { PluginDefinition } from "../server/services/pluginHostService";

const MbOrganReedPlugin: PluginDefinition = {
  id: "mb-organ-reed",
  slug: "mb-organ-reed",
  name: "MB Reed Organ",
  category: "instrument",
  type: "organ" as any,
  version: "1.0.0",
  description: "Vintage reed organ (harmonium) with breathy tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.4 },
    { type: "square", detune: 5, gain: 0.3 },
    { type: "noise", detune: 0, gain: 0.1 },
    { type: "sine", detune: 0, gain: 0.2 },
  ],
  envelope: { attack: 0.08, decay: 0.15, sustain: 0.9, release: 0.15 },
  parameters: [
    {
      id: "bellows",
      name: "Bellows",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "stops",
      name: "Stops",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tremulant",
      name: "Tremulant",
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
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { bellows: 0.6, stops: 0.5, tremulant: 0.3, volume: 0.8 },
};

export default MbOrganReedPlugin;
