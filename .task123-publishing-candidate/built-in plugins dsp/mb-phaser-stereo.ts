import type { PluginDefinition } from "../server/services/pluginHostService";

const MbPhaserStereoPlugin: PluginDefinition = {
  id: "mb-phaser-stereo",
  slug: "mb-phaser-stereo",
  name: "MB Stereo Phaser",
  category: "effect",
  type: "phaser",
  version: "1.0.0",
  description: "Wide stereo phasing",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "rate",
      name: "Rate",
      type: "float",
      defaultValue: 0.4,
      minValue: 0.01,
      maxValue: 8,
      automatable: true,
    },
    {
      id: "depth",
      name: "Depth",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "spread",
      name: "Spread",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { rate: 0.4, depth: 0.8, spread: 0.7, mix: 0.5 },
};

export default MbPhaserStereoPlugin;
