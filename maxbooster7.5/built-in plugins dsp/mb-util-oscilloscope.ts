import type { PluginDefinition } from "../server/services/pluginHostService";

const MbUtilOscilloscopePlugin: PluginDefinition = {
  id: "mb-util-oscilloscope",
  slug: "mb-util-oscilloscope",
  name: "MB Oscilloscope",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Real-time waveform display with trigger and zoom",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "timeScale",
      name: "Time Scale",
      type: "float",
      defaultValue: 10,
      minValue: 1,
      maxValue: 100,
      automatable: false,
    },
    {
      id: "triggerLevel",
      name: "Trigger Level",
      type: "float",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
      automatable: false,
    },
    {
      id: "zoom",
      name: "Zoom",
      type: "float",
      defaultValue: 1,
      minValue: 0.1,
      maxValue: 10,
      automatable: false,
    },
  ],
  defaultPreset: { timeScale: 10, triggerLevel: 0, zoom: 1 },
};

export default MbUtilOscilloscopePlugin;
