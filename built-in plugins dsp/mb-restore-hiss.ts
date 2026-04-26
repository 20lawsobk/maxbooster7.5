import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreHissPlugin: PluginDefinition = { id: 'mb-restore-hiss', slug: 'mb-restore-hiss', name: 'MB Hiss Removal', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Targeted high-frequency hiss removal with minimal artifacts', author: 'Max Booster', grade: 'A', parameters: [{ id: 'threshold', name: 'Threshold', type: 'float', defaultValue: -50, minValue: -80, maxValue: -20, automatable: true }, { id: 'reduction', name: 'Reduction', type: 'float', defaultValue: 20, minValue: 0, maxValue: 40, automatable: true }, { id: 'frequency', name: 'Frequency', type: 'float', defaultValue: 4000, minValue: 1000, maxValue: 12000, automatable: true }, { id: 'smoothing', name: 'Smoothing', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { threshold: -50, reduction: 20, frequency: 4000, smoothing: 0.5 } };

export default MbRestoreHissPlugin;
