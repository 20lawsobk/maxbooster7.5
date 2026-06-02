import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBellChurchbellPlugin: PluginDefinition = {
  id: "mb-bell-churchbell",
  slug: "mb-bell-churchbell",
  name: "MB Church Bell",
  category: "instrument",
  type: "bell" as any,
  version: "1.0.0",
  description: "Deep resonant church bell with complex partials",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.35 },
    { type: "sine", detune: 1200, gain: 0.25 },
    { type: "sine", detune: 1550, gain: 0.2 },
    { type: "sine", detune: 2400, gain: 0.2 },
  ],
  envelope: { attack: 0.005, decay: 4.0, sustain: 0.1, release: 3.0 },
  parameters: [
    {
      id: "size",
      name: "Bell Size",
      type: "float",
      defaultValue: 0.6,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "decay_time",
      name: "Decay",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "partials",
      name: "Partials",
      type: "float",
      defaultValue: 0.5,
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
  defaultPreset: { size: 0.6, decay_time: 0.8, partials: 0.5, volume: 0.8 },
};

export default MbBellChurchbellPlugin;
