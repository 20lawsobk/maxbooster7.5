import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilDelayCompPlugin: PluginDefinition = { id: 'mb-util-delay-comp', slug: 'mb-util-delay-comp', name: 'MB Delay Compensation', category: 'effect', type: 'delay' as any, version: '1.0.0', description: 'Manual sample-accurate delay for phase alignment', author: 'Max Booster', parameters: [{ id: 'samples', name: 'Delay Samples', type: 'float', defaultValue: 0, minValue: 0, maxValue: 4096, automatable: false }, { id: 'channel', name: 'Channel', type: 'float', defaultValue: 0, minValue: 0, maxValue: 2, automatable: false }], defaultPreset: { samples: 0, channel: 0 } };

export default MbUtilDelayCompPlugin;
