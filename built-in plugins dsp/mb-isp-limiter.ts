import type { PluginDefinition } from '../server/services/pluginHostService';

const MbIspLimiterPlugin: PluginDefinition = { id: 'mb-isp-limiter', slug: 'mb-isp-limiter', name: 'MB ISP Limiter', category: 'effect', type: 'limiter' as any, version: '1.0.0', description: 'Inter-sample peak limiter for codec-safe masters', author: 'Max Booster', grade: 'A', parameters: [{ id: 'ceiling', name: 'Ceiling', type: 'float', defaultValue: -1, minValue: -6, maxValue: 0, automatable: true }, { id: 'margin', name: 'ISP Margin', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 3, automatable: true }, { id: 'release', name: 'Release', type: 'float', defaultValue: 80, minValue: 10, maxValue: 500, automatable: true }], defaultPreset: { ceiling: -1, margin: 0.5, release: 80 } };

export default MbIspLimiterPlugin;
