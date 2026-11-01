import type { PluginDefinition } from "../server/services/pluginHostService";

const MbOrganTransistorPlugin: PluginDefinition = {
  id: "mb-organ-transistor",
  slug: "mb-organ-transistor",
  name: "MB Transistor Organ",
  category: "instrument",
  type: "organ" as any,
  version: "1.0.0",
  description: "Vintage transistor organ with retro character",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: 0, gain: 0.6 },
    { type: "sawtooth", detune: 0, gain: 0.2 },
    { type: "sine", detune: 1200, gain: 0.2 },
  ],
  envelope: { attack: 0.002, decay: 0.03, sustain: 1.0, release: 0.05 },
  parameters: [
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
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "chorus",
      name: "Chorus",
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
  defaultPreset: { tone: 0.5, vibrato: 0.3, chorus: 0.4, volume: 0.8 },
};

export default MbOrganTransistorPlugin;
