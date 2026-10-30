import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBassElectricPlugin: PluginDefinition = {
  id: "mb-bass-electric",
  slug: "mb-bass-electric",
  name: "MB Electric Bass",
  category: "instrument",
  type: "bass",
  version: "1.0.0",
  description: "Fingered electric bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "triangle", detune: 0, gain: 0.6 },
    { type: "sine", detune: 0, gain: 0.4 },
  ],
  envelope: { attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.3 },
  parameters: [
    {
      id: "tone",
      name: "Tone",
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
  defaultPreset: { tone: 0.5, volume: 0.8 },
};

export default MbBassElectricPlugin;
