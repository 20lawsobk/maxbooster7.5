import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBrassMutedTrumpetPlugin: PluginDefinition = {
  id: "mb-brass-muted-trumpet",
  slug: "mb-brass-muted-trumpet",
  name: "MB Muted Trumpet",
  category: "instrument",
  type: "brass" as any,
  version: "1.0.0",
  description: "Jazz muted trumpet with harmon mute character",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: 0, gain: 0.4 },
    { type: "sawtooth", detune: 0, gain: 0.35 },
    { type: "sine", detune: 1200, gain: 0.25 },
  ],
  envelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.12 },
  parameters: [
    {
      id: "mute_type",
      name: "Mute Type",
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
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "nasality",
      name: "Nasality",
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
  defaultPreset: { mute_type: 0.5, vibrato: 0.3, nasality: 0.6, volume: 0.8 },
};

export default MbBrassMutedTrumpetPlugin;
