import type { PluginDefinition } from '../server/services/pluginHostService';

const MbUtilTesttonePlugin: PluginDefinition = { id: 'mb-util-testtone', slug: 'mb-util-testtone', name: 'MB Test Tone Generator', category: 'effect', type: 'eq' as any, version: '1.0.0', description: 'Generate test tones, sweeps, and noise for calibration', author: 'Max Booster', grade: 'A', parameters: [{ id: 'frequency', name: 'Frequency', type: 'float', defaultValue: 1000, minValue: 20, maxValue: 20000, automatable: true }, { id: 'level', name: 'Level', type: 'float', defaultValue: -20, minValue: -60, maxValue: 0, automatable: true }, { id: 'waveform', name: 'Waveform', type: 'float', defaultValue: 0, minValue: 0, maxValue: 4, automatable: false }], defaultPreset: { frequency: 1000, level: -20, waveform: 0 } };

export default MbUtilTesttonePlugin;
