import type { PluginDefinition } from "../server/services/pluginHostService";

const MbSynthArpPlugin: PluginDefinition = {
  id: "mb-synth-arp",
  slug: "mb-synth-arp",
  name: "MB Arp Synth",
  category: "instrument",
  type: "analog",
  version: "1.0.0",
  description: "Arpeggiated synth sounds",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "square", detune: 0, gain: 0.5 },
    { type: "sawtooth", detune: 5, gain: 0.5 },
  ],
  envelope: { attack: 0.001, decay: 0.15, sustain: 0.3, release: 0.1 },
  parameters: [
    {
      id: "cutoff",
      name: "Cutoff",
      type: "float",
      defaultValue: 3000,
      minValue: 100,
      maxValue: 15000,
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
  defaultPreset: { cutoff: 3000, volume: 0.8 },
};

export default MbSynthArpPlugin;
