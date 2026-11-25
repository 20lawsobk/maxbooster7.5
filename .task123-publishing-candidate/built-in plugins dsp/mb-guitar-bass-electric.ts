import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGuitarBassElectricPlugin: PluginDefinition = {
  id: "mb-guitar-bass-electric",
  slug: "mb-guitar-bass-electric",
  name: "MB Electric Bass Guitar",
  category: "instrument",
  type: "guitar" as any,
  version: "1.0.0",
  description: "Electric bass guitar with punchy fingerstyle tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.5 },
    { type: "sawtooth", detune: 0, gain: 0.3 },
    { type: "triangle", detune: -1200, gain: 0.2 },
  ],
  envelope: { attack: 0.002, decay: 0.4, sustain: 0.5, release: 0.2 },
  parameters: [
    {
      id: "pickup",
      name: "Pickup Blend",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tone",
      name: "Tone",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "finger_pick",
      name: "Finger/Pick",
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
  defaultPreset: { pickup: 0.5, tone: 0.5, finger_pick: 0.3, volume: 0.8 },
};

export default MbGuitarBassElectricPlugin;
