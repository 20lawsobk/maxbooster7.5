import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGuitarResonatorPlugin: PluginDefinition = {
  id: "mb-guitar-resonator",
  slug: "mb-guitar-resonator",
  name: "MB Resonator Guitar",
  category: "instrument",
  type: "guitar" as any,
  version: "1.0.0",
  description: "Metal body resonator guitar with bluesy twang",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.4 },
    { type: "sawtooth", detune: 0, gain: 0.3 },
    { type: "sine", detune: 1200, gain: 0.2 },
    { type: "sine", detune: 0, gain: 0.1 },
  ],
  envelope: { attack: 0.001, decay: 0.5, sustain: 0.3, release: 0.4 },
  parameters: [
    {
      id: "cone",
      name: "Cone Resonance",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "slide",
      name: "Slide",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.6,
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
  defaultPreset: { cone: 0.6, slide: 0.4, brightness: 0.6, volume: 0.8 },
};

export default MbGuitarResonatorPlugin;
