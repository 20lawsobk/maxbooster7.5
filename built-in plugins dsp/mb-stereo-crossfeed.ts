import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStereoCrossfeedPlugin: PluginDefinition = {
  id: "mb-stereo-crossfeed",
  slug: "mb-stereo-crossfeed",
  name: "MB Crossfeed",
  category: "effect",
  type: "stereo" as any,
  version: "1.0.0",
  description: "Headphone crossfeed for natural speaker-like imaging",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "amount",
      name: "Amount",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "frequency",
      name: "Frequency",
      type: "float",
      defaultValue: 700,
      minValue: 300,
      maxValue: 2000,
      automatable: true,
    },
    {
      id: "delay",
      name: "Delay",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { amount: 0.3, frequency: 700, delay: 0.3 },
};

export default MbStereoCrossfeedPlugin;
