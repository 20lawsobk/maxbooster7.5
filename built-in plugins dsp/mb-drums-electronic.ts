import type { PluginDefinition } from "../server/services/pluginHostService";

const MbDrumsElectronicPlugin: PluginDefinition = {
  id: "mb-drums-electronic",
  slug: "mb-drums-electronic",
  name: "MB Electronic Kit",
  category: "instrument",
  type: "drums",
  version: "1.0.0",
  description: "Classic 808/909 electronic drums",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.8 },
    { type: "noise", detune: 0, gain: 0.6 },
  ],
  envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.4 },
  parameters: [
    {
      id: "decay",
      name: "Decay",
      type: "float",
      defaultValue: 0.5,
      minValue: 0.1,
      maxValue: 2,
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
  defaultPreset: { decay: 0.5, volume: 0.8 },
};

export default MbDrumsElectronicPlugin;
