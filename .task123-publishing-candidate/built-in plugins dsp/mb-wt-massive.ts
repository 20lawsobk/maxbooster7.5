import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWtMassivePlugin: PluginDefinition = {
  id: "mb-wt-massive",
  slug: "mb-wt-massive",
  name: "MB Massive Bass",
  category: "instrument",
  type: "wavetable",
  version: "1.0.0",
  description: "Huge wavetable bass",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sawtooth", detune: 0, gain: 0.9 }],
  envelope: { attack: 0.001, decay: 0.3, sustain: 0.7, release: 0.2 },
  parameters: [
    {
      id: "position",
      name: "Wave Position",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "intensity",
      name: "Intensity",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.85,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { position: 0.3, intensity: 0.8, volume: 0.85 },
};

export default MbWtMassivePlugin;
