import type { PluginDefinition } from "../server/services/pluginHostService";

const MbOrganComboPlugin: PluginDefinition = {
  id: "mb-organ-combo",
  slug: "mb-organ-combo",
  name: "MB Combo Organ",
  category: "instrument",
  type: "organ" as any,
  version: "1.0.0",
  description: "Vintage 60s combo organ with transistor tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: 0, gain: 0.5 },
    { type: "square", detune: 1200, gain: 0.3 },
    { type: "sine", detune: 0, gain: 0.2 },
  ],
  envelope: { attack: 0.003, decay: 0.05, sustain: 0.95, release: 0.05 },
  parameters: [
    {
      id: "tabs",
      name: "Tab Selection",
      type: "float",
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.4,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { tabs: 0.5, vibrato: 0.4, brightness: 0.6, volume: 0.8 },
};

export default MbOrganComboPlugin;
