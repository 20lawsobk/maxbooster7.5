import type { PluginDefinition } from "../server/services/pluginHostService";

const MbTruePeakLimiterPlugin: PluginDefinition = {
  id: "mb-true-peak-limiter",
  slug: "mb-true-peak-limiter",
  name: "MB True Peak Limiter",
  category: "effect",
  type: "limiter" as any,
  version: "1.0.0",
  description: "ITU-R BS.1770 compliant true peak limiter",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "ceiling",
      name: "Ceiling",
      type: "float",
      defaultValue: -1,
      minValue: -6,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "release",
      name: "Release",
      type: "float",
      defaultValue: 100,
      minValue: 10,
      maxValue: 1000,
      automatable: true,
    },
    {
      id: "oversampling",
      name: "Oversampling",
      type: "float",
      defaultValue: 4,
      minValue: 2,
      maxValue: 8,
      automatable: false,
    },
    {
      id: "lookahead",
      name: "Lookahead",
      type: "float",
      defaultValue: 5,
      minValue: 0,
      maxValue: 20,
      automatable: false,
    },
  ],
  defaultPreset: { ceiling: -1, release: 100, oversampling: 4, lookahead: 5 },
};

export default MbTruePeakLimiterPlugin;
