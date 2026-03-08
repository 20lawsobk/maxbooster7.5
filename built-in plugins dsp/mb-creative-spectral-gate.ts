import type { PluginDefinition } from '../server/services/pluginHostService';

const MbCreativeSpectralGatePlugin: PluginDefinition = { id: 'mb-creative-spectral-gate', slug: 'mb-creative-spectral-gate', name: 'MB Spectral Gate', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'FFT-based spectral gating for isolating specific frequency regions', author: 'Max Booster', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -40, minValue: -80, maxValue: 0, automatable: true }, { id: 'fftSize', name: 'FFT Size', type: 'float', defaultValue: 2048, minValue: 256, maxValue: 8192, automatable: false }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 1, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { threshold: -40, fftSize: 2048, smoothing: 0.5, mix: 1 } };

export default MbCreativeSpectralGatePlugin;
