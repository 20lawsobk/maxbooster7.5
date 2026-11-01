import type { PluginDefinition } from "../server/services/pluginHostService";

const MbVocalRiderPlugin: PluginDefinition = {
  id: "mb-vocal-rider",
  slug: "mb-vocal-rider",
  name: "MB Vocal Rider",
  category: "effect",
  type: "vocal",
  version: "1.0.0",
  description: "Automatic vocal level riding",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "target",
      name: "Target",
      type: "float",
      defaultValue: -12,
      minValue: -24,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "speed",
      name: "Speed",
      type: "float",
      defaultValue: 0.5,
      minValue: 0.1,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "range",
      name: "Range",
      type: "float",
      defaultValue: 12,
      minValue: 3,
      maxValue: 24,
      automatable: true,
    },
  ],
  defaultPreset: { target: -12, speed: 0.5, range: 12 },
};

export default MbVocalRiderPlugin;
