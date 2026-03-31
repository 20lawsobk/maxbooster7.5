import type { PluginDefinition } from '../server/services/pluginHostService';

const MbEqGraphicPlugin: PluginDefinition = { id: 'mb-eq-graphic', slug: 'mb-eq-graphic', name: 'MB Graphic EQ', category: 'effect', type: 'eq', version: '1.0.0', description: '10-band graphic EQ', author: 'Max Booster', parameters: [{ id: 'band1', name: '31Hz', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'band2', name: '62Hz', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'band3', name: '125Hz', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'band4', name: '250Hz', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'band5', name: '500Hz', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }], defaultPreset: { band1: 0, band2: 0, band3: 0, band4: 0, band5: 0 } };

export default MbEqGraphicPlugin;
