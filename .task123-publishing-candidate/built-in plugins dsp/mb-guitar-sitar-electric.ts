import type { PluginDefinition } from "../server/services/pluginHostService";

const MbGuitarSitarElectricPlugin: PluginDefinition = {
  id: "mb-guitar-sitar-electric",
  slug: "mb-guitar-sitar-electric",
  name: "MB Electric Sitar",
  category: "instrument",
  type: "guitar" as any,
  version: "1.0.0",
  description: "Electric sitar guitar with buzzing bridge",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.4 },
    { type: "triangle", detune: 3, gain: 0.3 },
    { type: "sine", detune: 1200, gain: 0.2 },
    { type: "sine", detune: 5, gain: 0.1 },
  ],
  envelope: { attack: 0.001, decay: 0.8, sustain: 0.3, release: 0.5 },
  parameters: [
    {
      id: "buzz",
      name: "Bridge Buzz",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "sympathetic",
      name: "Sympathetic",
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
  defaultPreset: { buzz: 0.6, sympathetic: 0.4, brightness: 0.5, volume: 0.8 },
};

export default MbGuitarSitarElectricPlugin;
