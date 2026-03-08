import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixVcaGroupPlugin: PluginDefinition = { id: 'mb-mix-vca-group', slug: 'mb-mix-vca-group', name: 'MB VCA Group', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'VCA-style group fader with smooth gain control', author: 'Max Booster', parameters: [{ id: 'gain', name: 'Gain', type: 'float', defaultValue: 0, minValue: -60, maxValue: 12, automatable: true }, { id: 'trim', name: 'Trim', type: 'float', defaultValue: 0, minValue: -12, maxValue: 12, automatable: true }, { id: 'link', name: 'Stereo Link', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { gain: 0, trim: 0, link: 1 } };

export default MbMixVcaGroupPlugin;
