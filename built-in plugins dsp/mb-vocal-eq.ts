import type { PluginDefinition } from '../server/services/pluginHostService';

const MbVocalEqPlugin: PluginDefinition = { id: 'mb-vocal-eq', slug: 'mb-vocal-eq', name: 'MB Vocal EQ', category: 'effect', type: 'vocal', version: '1.0.0', description: 'Vocal-tuned equalizer', author: 'Max Booster', parameters: [{ id: 'lowCut', name: 'Low Cut', type: 'float', defaultValue: 80, minValue: 20, maxValue: 300, automatable: true }, { id: 'presence', name: 'Presence', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'air', name: 'Air', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }], defaultPreset: { lowCut: 80, presence: 0, air: 0 } };

export default MbVocalEqPlugin;
