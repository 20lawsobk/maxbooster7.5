import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixSendFxPlugin: PluginDefinition = { id: 'mb-mix-send-fx', slug: 'mb-mix-send-fx', name: 'MB Send Manager', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Multi-send routing with pre/post fader options', author: 'Max Booster', grade: 'A', parameters: [{ id: 'sendA', name: 'Send A', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'sendB', name: 'Send B', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'sendC', name: 'Send C', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }, { id: 'sendD', name: 'Send D', type: 'float', defaultValue: 0, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { sendA: 0, sendB: 0, sendC: 0, sendD: 0 } };

export default MbMixSendFxPlugin;
