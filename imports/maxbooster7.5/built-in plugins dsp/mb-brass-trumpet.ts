import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBrassTrumpetPlugin: PluginDefinition = {
  id: "mb-brass-trumpet",
  slug: "mb-brass-trumpet",
  name: "MB Trumpet",
  category: "instrument",
  type: "brass" as any,
  version: "1.0.0",
  description: "Bright solo trumpet with expressive dynamics",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.6 },
    { type: "square", detune: 0, gain: 0.3 },
    { type: "sine", detune: 1200, gain: 0.1 },
  ],
  envelope: { attack: 0.03, decay: 0.2, sustain: 0.85, release: 0.15 },
  parameters: [
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "mute",
      name: "Mute",
      type: "float",
      defaultValue: 0,
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
  defaultPreset: { brightness: 0.7, vibrato: 0.3, mute: 0, volume: 0.8 },
};

export default MbBrassTrumpetPlugin;
