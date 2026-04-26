import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDrumsLofiPlugin: PluginDefinition = {
    id: 'mb-drums-lofi', slug: 'mb-drums-lofi', name: 'MB Lo-Fi Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Dusty lo-fi hip hop drums', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }, { type: 'noise', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.003, decay: 0.25, sustain: 0.05, release: 0.3 },
    parameters: [
      { id: 'vinyl', name: 'Vinyl', type: 'float', defaultValue: 0.6, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { vinyl: 0.6, volume: 0.75 },
  };

export default MbDrumsLofiPlugin;
