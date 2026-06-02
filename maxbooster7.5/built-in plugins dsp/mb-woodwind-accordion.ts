import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWoodwindAccordionPlugin: PluginDefinition = {
  id: "mb-woodwind-accordion",
  slug: "mb-woodwind-accordion",
  name: "MB Accordion",
  category: "instrument",
  type: "woodwind" as any,
  version: "1.0.0",
  description: "Classic accordion with bellows expression",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: -5, gain: 0.35 },
    { type: "square", detune: 5, gain: 0.35 },
    { type: "sawtooth", detune: 0, gain: 0.3 },
  ],
  envelope: { attack: 0.03, decay: 0.1, sustain: 0.95, release: 0.1 },
  parameters: [
    {
      id: "bellows",
      name: "Bellows",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "register",
      name: "Register",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "tremolo",
      name: "Tremolo",
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
  defaultPreset: { bellows: 0.7, register: 0.5, tremolo: 0.3, volume: 0.8 },
};

export default MbWoodwindAccordionPlugin;
