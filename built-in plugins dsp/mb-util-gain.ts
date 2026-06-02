import type { PluginDefinition } from "../server/services/pluginHostService";

const MbUtilGainPlugin: PluginDefinition = {
  id: "mb-util-gain",
  slug: "mb-util-gain",
  name: "MB Gain",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Simple gain utility with phase inversion",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "gain",
      name: "Gain",
      type: "float",
      defaultValue: 0,
      minValue: -48,
      maxValue: 48,
      automatable: true,
    },
    {
      id: "pan",
      name: "Pan",
      type: "float",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "phaseL",
      name: "Phase Invert L",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: false,
    },
    {
      id: "phaseR",
      name: "Phase Invert R",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: false,
    },
  ],
  defaultPreset: { gain: 0, pan: 0, phaseL: 0, phaseR: 0 },
};

export default MbUtilGainPlugin;
