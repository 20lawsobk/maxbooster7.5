import type { PluginDefinition } from "../server/services/pluginHostService";

const MbBrassTubaPlugin: PluginDefinition = {
  id: "mb-brass-tuba",
  slug: "mb-brass-tuba",
  name: "MB Tuba",
  category: "instrument",
  type: "brass" as any,
  version: "1.0.0",
  description: "Deep powerful tuba with heavy low end",
  author: "Max Booster",
  grade: "A",
  oscillators: [
    { type: "sawtooth", detune: 0, gain: 0.5 },
    { type: "sine", detune: -1200, gain: 0.4 },
    { type: "square", detune: 0, gain: 0.1 },
  ],
  envelope: { attack: 0.06, decay: 0.3, sustain: 0.7, release: 0.25 },
  parameters: [
    {
      id: "body",
      name: "Body",
      type: "float",
      defaultValue: 0.8,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "brightness",
      name: "Brightness",
      type: "float",
      defaultValue: 0.3,
      minValue: 0,
      maxValue: 1,
      automatable: true,
    },
    {
      id: "air",
      name: "Air",
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
  defaultPreset: { body: 0.8, brightness: 0.3, air: 0.2, volume: 0.8 },
};

export default MbBrassTubaPlugin;
