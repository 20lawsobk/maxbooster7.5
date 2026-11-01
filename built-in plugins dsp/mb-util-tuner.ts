import type { PluginDefinition } from "../server/services/pluginHostService";

const MbUtilTunerPlugin: PluginDefinition = {
  id: "mb-util-tuner",
  slug: "mb-util-tuner",
  name: "MB Chromatic Tuner",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Precision chromatic tuner with reference pitch adjustment",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "reference",
      name: "Reference Pitch",
      type: "float",
      defaultValue: 440,
      minValue: 420,
      maxValue: 460,
      automatable: false,
    },
    {
      id: "tolerance",
      name: "Tolerance",
      type: "float",
      defaultValue: 5,
      minValue: 1,
      maxValue: 20,
      automatable: false,
    },
    {
      id: "mute",
      name: "Mute Through",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: false,
    },
  ],
  defaultPreset: { reference: 440, tolerance: 5, mute: 0 },
};

export default MbUtilTunerPlugin;
