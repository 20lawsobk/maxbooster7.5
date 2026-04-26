import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDrumsPercussionPlugin: PluginDefinition = {
    id: 'mb-drums-percussion', slug: 'mb-drums-percussion', name: 'MB World Percussion', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Ethnic world percussion', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'triangle', detune: 0, gain: 0.5 }, { type: 'noise', detune: 0, gain: 0.3 }, { type: 'sine', detune: 0, gain: 0.4 }],
    envelope: { attack: 0.002, decay: 0.2, sustain: 0.0, release: 0.25 },
    parameters: [
      { id: 'tone', name: 'Tone', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { tone: 0.5, volume: 0.8 },
  };

export default MbDrumsPercussionPlugin;
