import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPadEvolvingPlugin: PluginDefinition = {
  id: "mb-pad-evolving",
  slug: "mb-pad-evolving",
  name: "MB Evolving Pad",
  category: "instrument",
  type: "pad",
  version: "1.0.0",
  description: "Slowly morphing textures",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -10, gain: 0.2 },
    { type: "triangle", detune: 0, gain: 0.3 },
    { type: "sawtooth", detune: 10, gain: 0.2 },
    { type: "sine", detune: 1200, gain: 0.3 },
  ],
  envelope: { attack: 3.0, decay: 2.0, sustain: 0.85, release: 5.0 },
  parameters: [
    {
      id: "morph",
      name: "Morph",
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
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { morph: 0.5, volume: 0.6 },
};

export default MbPadEvolvingPlugin;
