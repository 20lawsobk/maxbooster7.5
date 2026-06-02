import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBrassFrenchhornPlugin: PluginDefinition = {
  id: "mb-brass-frenchhorn",
  slug: "mb-brass-frenchhorn",
  name: "MB French Horn",
  category: "instrument",
  type: "brass" as any,
  version: "1.0.0",
  description: "Majestic French horn with noble character",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.4 },
    { type: "triangle", detune: 0, gain: 0.4 },
    { type: "sine", detune: -5, gain: 0.2 },
  ],
  envelope: { attack: 0.08, decay: 0.4, sustain: 0.75, release: 0.3 },
  parameters: [
    {
      id: "warmth",
      name: "Warmth",
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
      defaultValue: 0.25,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "stopped",
      name: "Stopped",
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
  defaultPreset: { warmth: 0.7, vibrato: 0.25, stopped: 0, volume: 0.8 },
};

export default MbBrassFrenchhornPlugin;
