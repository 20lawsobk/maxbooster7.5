import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWoodwindRecorderPlugin: PluginDefinition = {
  id: "mb-woodwind-recorder",
  slug: "mb-woodwind-recorder",
  name: "MB Recorder",
  category: "instrument",
  type: "woodwind" as any,
  version: "1.0.0",
  description: "Gentle recorder with sweet medieval tone",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sine", detune: 0, gain: 0.55 },
    { type: "triangle", detune: 0, gain: 0.35 },
    { type: "noise", detune: 0, gain: 0.1 },
  ],
  envelope: { attack: 0.03, decay: 0.2, sustain: 0.8, release: 0.1 },
  parameters: [
    {
      id: "breath",
      name: "Breath",
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
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "vibrato",
      name: "Vibrato",
      type: "float",
      defaultValue: 0.2,
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
  defaultPreset: { breath: 0.4, brightness: 0.5, vibrato: 0.2, volume: 0.8 },
};

export default MbWoodwindRecorderPlugin;
