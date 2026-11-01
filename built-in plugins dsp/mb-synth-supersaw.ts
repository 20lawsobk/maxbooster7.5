import type { PluginDefinition } from "../server/services/pluginHostService";

const MbSynthSupersawPlugin: PluginDefinition = {
  id: "mb-synth-supersaw",
  slug: "mb-synth-supersaw",
  name: "MB Supersaw",
  category: "instrument",
  type: "analog",
  version: "1.0.0",
  description: "Massive supersaw stack",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -15, gain: 0.15 },
    { type: "sawtooth", detune: -7, gain: 0.15 },
    { type: "sawtooth", detune: 0, gain: 0.2 },
    { type: "sawtooth", detune: 7, gain: 0.15 },
    { type: "sawtooth", detune: 15, gain: 0.15 },
  ],
  envelope: { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5 },
  parameters: [
    {
      id: "detune",
      name: "Detune",
      type: "float",
      defaultValue: 15,
      minValue: 0,
      maxValue: 50,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.75,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { detune: 15, volume: 0.75 },
};

export default MbSynthSupersawPlugin;
