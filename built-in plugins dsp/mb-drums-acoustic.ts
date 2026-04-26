import type { PluginDefinition } from '../server/services/pluginHostService';

const MbDrumsAcousticPlugin: PluginDefinition = {
    id: 'mb-drums-acoustic', slug: 'mb-drums-acoustic', name: 'MB Acoustic Kit', category: 'instrument', type: 'drums', version: '1.0.0',
    description: 'Natural acoustic drum kit', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }, { type: 'noise', detune: 0, gain: 0.5 }],
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.3 },
    parameters: [
      { id: 'punch', name: 'Punch', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true },
      { id: 'room', name: 'Room', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { punch: 0.7, room: 0.3, volume: 0.8 },
  };

export default MbDrumsAcousticPlugin;
