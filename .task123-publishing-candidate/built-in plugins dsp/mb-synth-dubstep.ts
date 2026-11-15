import type { PluginDefinition } from "../server/services/pluginHostService";

const MbSynthDubstepPlugin: PluginDefinition = {
  id: "mb-synth-dubstep",
  slug: "mb-synth-dubstep",
  name: "MB Dubstep Synth",
  category: "instrument",
  type: "analog",
  version: "1.0.0",
  description: "Aggressive dubstep sounds",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "square", detune: 0, gain: 0.5 },
  ],
  envelope: { attack: 0.001, decay: 0.1, sustain: 0.8, release: 0.1 },
  parameters: [
    {
      id: "drive",
      name: "Drive",
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
  defaultPreset: { drive: 0.7, volume: 0.8 },
};

export default MbSynthDubstepPlugin;
