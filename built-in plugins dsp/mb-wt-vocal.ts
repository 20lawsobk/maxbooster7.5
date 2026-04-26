import type { PluginDefinition } from '../server/services/pluginHostService';

const MbWtVocalPlugin: PluginDefinition = { id: 'mb-wt-vocal', slug: 'mb-wt-vocal', name: 'MB Vocal Wavetable', category: 'instrument', type: 'wavetable', version: '1.0.0', description: 'Vocal formant wavetables', author: 'Max Booster', grade: 'A', oscillators: [{ type: 'sine', detune: 0, gain: 0.7 }], envelope: { attack: 0.1, decay: 0.4, sustain: 0.7, release: 0.5 }, parameters: [{ id: 'vowel', name: 'Vowel', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'formant', name: 'Formant', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'volume', name: 'Volume', type: 'float', defaultValue: 0.75, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { vowel: 0.5, formant: 0.5, volume: 0.75 } };

export default MbWtVocalPlugin;
