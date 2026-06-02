import type { PluginDefinition } from "../server/services/pluginHostService";

const MbUtilAbSwitchPlugin: PluginDefinition = {
  id: "mb-util-ab-switch",
  slug: "mb-util-ab-switch",
  name: "MB A/B Switch",
  category: "effect",
  type: "eq" as any,
  version: "1.0.0",
  description: "Quick A/B comparison switch for effect chain bypass",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "position",
      name: "A/B Position",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "gainComp",
      name: "Gain Compensation",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
  ],
  defaultPreset: { position: 0, gainComp: 0 },
};

export default MbUtilAbSwitchPlugin;
