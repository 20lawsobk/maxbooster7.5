import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVocalVocoderPlugin: PluginDefinition = { id: 'mb-vocal-vocoder', slug: 'mb-vocal-vocoder', name: 'MB Vocoder', category: 'effect', type: 'vocal', version: '1.0.0', description: 'Classic vocoder synthesis', author: 'Max Booster', grade: 'A', parameters: [{ id: 'bands', name: 'Bands', type: 'float', defaultValue: 16, minValue: 8, maxValue: 32, automatable: false }, { id: 'formant', name: 'Formant', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'carrier', name: 'Carrier Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { bands: 16, formant: 0, carrier: 0.5 } };

export default MbVocalVocoderPlugin;
