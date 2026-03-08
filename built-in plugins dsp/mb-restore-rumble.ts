import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreRumblePlugin: PluginDefinition = { id: 'mb-restore-rumble', slug: 'mb-restore-rumble', name: 'MB Rumble Filter', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Subsonic rumble removal with steep filtering', author: 'Max Booster', parameters: [{ id: 'frequency', name: 'Frequency', type: 'float', defaultValue: 30, minValue: 10, maxValue: 80, automatable: true }, { id: 'slope', name: 'Slope', type: 'float', defaultValue: 24, minValue: 6, maxValue: 48, automatable: false }, { id: 'resonance', name: 'Resonance', type: 'float', defaultValue: 0, minValue: 0, maxValue: 0.5, automatable: true }], defaultPreset: { frequency: 30, slope: 24, resonance: 0 } };

export default MbRestoreRumblePlugin;
