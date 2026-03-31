import type { PluginDefinition } from '../server/services/pluginHostService';

const MbSynthChiptunePlugin: PluginDefinition = {
    id: 'mb-synth-chiptune', slug: 'mb-synth-chiptune', name: 'MB Chiptune', category: 'instrument', type: 'analog', version: '1.0.0',
    description: '8-bit chiptune sounds', author: 'Max Booster',
    oscillators: [{ type: 'square', detune: 0, gain: 0.8 }, { type: 'triangle', detune: 0, gain: 0.2 }],
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.5, release: 0.1 },
    parameters: [
      { id: 'duty', name: 'Duty', type: 'float', defaultValue: 0.5, minValue: 0.1, maxValue: 0.9, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { duty: 0.5, volume: 0.7 },
  };

export default MbSynthChiptunePlugin;
