import type { PluginDefinition } from "../server/services/pluginHostService";

const MbWtEvolvingPlugin: PluginDefinition = {
  id: "mb-wt-evolving",
  slug: "mb-wt-evolving",
  name: "MB Evolving Pad",
  category: "instrument",
  type: "wavetable",
  version: "1.0.0",
  description: "Slowly morphing wavetable pad",
  author: "Max Booster",
  grade: "A",
  oscillators: [{ type: "sine", detune: 0, gain: 0.6 }],
  envelope: { attack: 2.0, decay: 1.0, sustain: 0.8, release: 3.0 },
  parameters: [
    {
      id: "position",
      name: "Wave Position",
      type: "float",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "lfoRate",
      name: "LFO Rate",
      type: "float",
      defaultValue: 0.1,
      minValue: 0.01,
      maxValue: 2,
      automatable: true,
    },
    {
      id: "volume",
      name: "Volume",
      type: "float",
      defaultValue: 0.7,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
  ],
  defaultPreset: { position: 0, lfoRate: 0.1, volume: 0.7 },
};

export default MbWtEvolvingPlugin;
