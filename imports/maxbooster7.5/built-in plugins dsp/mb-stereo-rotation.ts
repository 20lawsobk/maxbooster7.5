import type { PluginDefinition } from "../server/services/pluginHostService";

const MbStereoRotationPlugin: PluginDefinition = {
  id: "mb-stereo-rotation",
  slug: "mb-stereo-rotation",
  name: "MB Stereo Rotation",
  category: "effect",
  type: "stereo" as any,
  version: "1.0.0",
  description: "Rotate stereo field with continuous angle control",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "angle",
      name: "Rotation Angle",
      type: "float",
      defaultValue: 0,
      minValue: -90,
      maxValue: 90,
      automatable: true,
    },
    {
      id: "lfoRate",
      name: "LFO Rate",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 5,
      automatable: true,
    },
    {
      id: "lfoDepth",
      name: "LFO Depth",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 90,
      automatable: true,
    },
  ],
  defaultPreset: { angle: 0, lfoRate: 0, lfoDepth: 0 },
};

export default MbStereoRotationPlugin;
