import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBass808Plugin: PluginDefinition = {
    id: 'mb-bass-808', slug: 'mb-bass-808', name: 'MB 808 Bass', category: 'instrument', type: 'bass', version: '1.0.0',
    description: 'Classic 808 kick bass', author: 'Max Booster', grade: 'A',
    oscillators: [{ type: 'sine', detune: 0, gain: 1.0 }],
    envelope: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 0.5 },
    parameters: [
      { id: 'slide', name: 'Slide', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true },
      { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.9, minValue: 0, maxValue: 1, automatable: true },
    ],
    defaultPreset: { slide: 0.3, volume: 0.9 },
  };

export default MbBass808Plugin;
