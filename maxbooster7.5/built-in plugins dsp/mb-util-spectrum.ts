import type { PluginDefinition } from "../server/services/pluginHostService";

const MbUtilSpectrumPlugin: PluginDefinition = {
  id: "mb-util-spectrum",
  slug: "mb-util-spectrum",
  name: "MB Spectrum Analyzer",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Real-time FFT spectrum analyzer with multiple display modes",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "fftSize",
      name: "FFT Size",
      type: "float",
      defaultValue: 4096,
      minValue: 512,
      maxValue: 16384,
      automatable: false,
    },
    {
      id: "smoothing",
      name: "Smoothing",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 0.99,
      automatable: false,
    },
    {
      id: "slope",
      name: "Slope",
      type: "float",
      defaultValue: 3,
      minValue: 0,
      maxValue: 6,
      automatable: false,
    },
  ],
  defaultPreset: { fftSize: 4096, smoothing: 0.8, slope: 3 },
};

export default MbUtilSpectrumPlugin;
