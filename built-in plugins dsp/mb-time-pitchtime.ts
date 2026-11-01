import type { PluginDefinition } from "../server/services/pluginHostService";

const MbTimePitchtimePlugin: PluginDefinition = {
  id: "mb-time-pitchtime",
  slug: "mb-time-pitchtime",
  name: "MB Pitch-Time",
  category: "effect",
  type: "delay" as any,
  version: "1.0.0",
  description: "Independent pitch and time manipulation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "pitch",
      name: "Pitch",
      type: "float",
      defaultValue: 0,
      minValue: -24,
      maxValue: 24,
      automatable: true,
    },
    {
      id: "timeRatio",
      name: "Time Ratio",
      type: "float",
      defaultValue: 1,
      minValue: 0.25,
      maxValue: 4,
      automatable: true,
    },
    {
      id: "formant",
      name: "Formant",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "mix",
      name: "Mix",
      type: "float",
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { pitch: 0, timeRatio: 1, formant: 0, mix: 1 },
};

export default MbTimePitchtimePlugin;
