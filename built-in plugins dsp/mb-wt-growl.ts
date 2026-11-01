import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWtGrowlPlugin: PluginDefinition = {
  id: "mb-wt-growl",
  slug: "mb-wt-growl",
  name: "MB Growl Bass",
  category: "instrument",
  type: "wavetable",
  version: "1.0.0",
  description: "Aggressive growling bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sawtooth", detune: 0, gain: 0.9 }],
  envelope: { attack: 0.001, decay: 0.15, sustain: 0.8, release: 0.1 },
  parameters: [
    {
      id: "position",
      name: "Wave Position",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "growl",
      name: "Growl",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.85,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { position: 0.7, growl: 0.8, volume: 0.85 },
};

export default MbWtGrowlPlugin;
