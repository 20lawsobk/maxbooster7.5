import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBrassEnsemblePlugin: PluginDefinition = {
  id: "mb-brass-ensemble",
  slug: "mb-brass-ensemble",
  name: "MB Brass Ensemble",
  category: "instrument",
  type: "brass" as any,
  version: "1.0.0",
  description: "Full brass section with trumpets, trombones and horns",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: -8, gain: 0.25 },
    { type: "sawtooth", detune: 0, gain: 0.3 },
    { type: "sawtooth", detune: 8, gain: 0.25 },
    { type: "square", detune: 0, gain: 0.2 },
  ],
  envelope: { attack: 0.06, decay: 0.3, sustain: 0.8, release: 0.25 },
  parameters: [
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
      id: "width",
      name: "Width",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "attack_feel",
      name: "Attack Feel",
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
  defaultPreset: { brightness: 0.6, width: 0.7, attack_feel: 0.5, volume: 0.8 },
};

export default MbBrassEnsemblePlugin;
