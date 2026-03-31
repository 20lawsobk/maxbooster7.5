import type { PluginDefinition } from '../server/services/pluginHostService';

const MbReverbChamberPlugin: PluginDefinition = { id: 'mb-reverb-chamber', slug: 'mb-reverb-chamber', name: 'MB Chamber Reverb', category: 'effect', type: 'reverb', version: '1.0.0', description: 'Echo chamber reverb', author: 'Max Booster', parameters: [{ id: 'size', name: 'Size', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'decay', name: 'Decay', type: 'float', defaultValue: 2.5, minValue: 0.5, maxValue: 8, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { size: 0.5, decay: 2.5, mix: 0.3 } };

export default MbReverbChamberPlugin;
