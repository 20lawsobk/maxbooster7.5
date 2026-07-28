import type { PluginDefinition } from "../server/services/pluginHostService";

const MbMeteringPlugin: PluginDefinition = {
  id: "mb-metering",
  slug: "mb-metering",
  name: "MB Metering Suite",
  category: "effect",
  type: "mastering" as any,
  version: "1.0.0",
  description: "Comprehensive metering with LUFS, RMS, peak, and dynamic range",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "standard",
      name: "Standard",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 3,
      automatable: false,
    },
    {
      id: "integration",
      name: "Integration Time",
      type: "float",
      defaultValue: 400,
      minValue: 100,
      maxValue: 3000,
      automatable: false,
    },
    {
      id: "reference",
      name: "Reference Level",
      type: "float",
      defaultValue: -14,
      minValue: -24,
      maxValue: -6,
      automatable: false,
    },
  ],
  defaultPreset: { standard: 0, integration: 400, reference: -14 },
};

export default MbMeteringPlugin;
