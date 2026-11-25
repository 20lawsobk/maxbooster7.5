import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMicU87Plugin: PluginDefinition = {
  id: "mb-mic-u87",
  slug: "mb-mic-u87",
  name: "MB U87 Modeler",
  category: "effect",
  type: "microphone",
  version: "1.0.0",
  description: "Neumann U87 emulation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "pattern",
      name: "Pattern",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "presence",
      name: "Presence",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "proximity",
      name: "Proximity",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { pattern: 0.5, presence: 0.5, proximity: 0.3 },
};

export default MbMicU87Plugin;
