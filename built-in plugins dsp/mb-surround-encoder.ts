import type { PluginDefinition } from "../server/services/pluginHostService";

const MbSurroundEncoderPlugin: PluginDefinition = {
  id: "mb-surround-encoder",
  slug: "mb-surround-encoder",
  name: "MB Surround Encoder",
  category: "effect",
  type: "stereo" as any,
  version: "1.0.0",
  description: "Stereo to surround upmix encoder for immersive formats",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "frontWidth",
      name: "Front Width",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "rearLevel",
      name: "Rear Level",
      type: "float",
      defaultValue: -6,
      minValue: -24,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "lfeLevel",
      name: "LFE Level",
      type: "float",
      defaultValue: -10,
      minValue: -24,
      maxValue: 0,
      automatable: true,
    },
    {
      id: "centerLevel",
      name: "Center Level",
      type: "float",
      defaultValue: -3,
      minValue: -24,
      maxValue: 0,
      automatable: true,
    },
  ],
  defaultPreset: {
    frontWidth: 0.8,
    rearLevel: -6,
    lfeLevel: -10,
    centerLevel: -3,
  },
};

export default MbSurroundEncoderPlugin;
