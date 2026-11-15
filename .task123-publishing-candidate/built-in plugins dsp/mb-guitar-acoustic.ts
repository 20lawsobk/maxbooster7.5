import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGuitarAcousticPlugin: PluginDefinition = {
  id: "mb-guitar-acoustic",
  slug: "mb-guitar-acoustic",
  name: "MB Acoustic Guitar",
  category: "instrument",
  type: "guitar" as any,
  version: "1.0.0",
  description: "Steel string acoustic guitar with natural body resonance",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.5 },
    { type: "sawtooth", detune: 0, gain: 0.2 },
    { type: "sine", detune: 1200, gain: 0.3 },
  ],
  envelope: { attack: 0.001, decay: 0.5, sustain: 0.3, release: 0.4 },
  parameters: [
    {
      id: "body",
      name: "Body",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "pick",
      name: "Pick Position",
      type: "float",
      defaultValue: 0.5,
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
  defaultPreset: { body: 0.6, brightness: 0.5, pick: 0.5, volume: 0.8 },
};

export default MbGuitarAcousticPlugin;
