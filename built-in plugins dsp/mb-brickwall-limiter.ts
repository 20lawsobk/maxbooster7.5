import type { PluginDefinition } from '../server/services/pluginHostService';

const MbBrickwallLimiterPlugin: PluginDefinition = { id: 'mb-brickwall-limiter', slug: 'mb-brickwall-limiter', name: 'MB Brickwall Limiter', category: 'effect', type: 'limiter' as any, version: '1.0.0', description: 'Zero-overshoot brickwall limiter for final mastering stage', author: 'Max Booster', parameters: [{ id: 'ceiling', name: 'Ceiling', type: 'float', defaultValue: -0.1, minValue: -6, maxValue: 0, automatable: true }, { id: 'input', name: 'Input Gain', type: 'float', defaultValue: 0, minValue: 0, maxValue: 24, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 50, minValue: 5, maxValue: 500, automatable: true }, { id: 'link', name: 'Stereo Link', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: false }], defaultPreset: { ceiling: -0.1, input: 0, release: 50, link: 1 } };

export default MbBrickwallLimiterPlugin;
