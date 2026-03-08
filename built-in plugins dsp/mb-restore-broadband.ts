import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreBroadbandPlugin: PluginDefinition = { id: 'mb-restore-broadband', slug: 'mb-restore-broadband', name: 'MB Broadband Denoiser', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Multi-band adaptive noise floor removal for broadband noise', author: 'Max Booster', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -50, minValue: -80, maxValue: -10, automatable: true }, { id: 'bands', name: 'Bands', type: 'float', defaultValue: 8, minValue: 4, maxValue: 16, automatable: false }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 15, minValue: 0, maxValue: 40, automatable: true }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { threshold: -50, bands: 8, reduction: 15, smoothing: 0.5 } };

export default MbRestoreBroadbandPlugin;
