import type { PluginDefinition } from "../server/services/pluginHostService";

const MbVocalFormantPlugin: PluginDefinition = {
  id: "mb-vocal-formant",
  slug: "mb-vocal-formant",
  name: "MB Formant Shifter",
  category: "effect",
  type: "vocal",
  version: "1.0.0",
  description: "Vocal formant manipulation",
  author: "Max Booster",
  grade: "A",
  parameters: [
    {
      id: "shift",
      name: "Formant Shift",
      type: "float",
      defaultValue: 0,
      minValue: -12,
      maxValue: 12,
      automatable: true,
    },
    {
      id: "character",
      name: "Character",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { shift: 0, character: 0.5 },
};

export default MbVocalFormantPlugin;
