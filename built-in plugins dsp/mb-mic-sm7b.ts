import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMicSm7bPlugin: PluginDefinition = {
  id: "mb-mic-sm7b",
  slug: "mb-mic-sm7b",
  name: "MB SM7B Modeler",
  category: "effect",
  type: "microphone",
  version: "1.0.0",
  description: "Shure SM7B emulation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "bass",
      name: "Bass Roll-off",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "presence",
      name: "Presence Peak",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { bass: 0, presence: 0.5 },
};

export default MbMicSm7bPlugin;
