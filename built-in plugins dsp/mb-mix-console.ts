import type { PluginDefinition } from '../server/services/pluginHostService';

const MbMixConsolePlugin: PluginDefinition = { id: 'mb-mix-console', slug: 'mb-mix-console', name: 'MB Console Emulator', category: 'effect', type: 'mixing' as any, version: '1.0.0', description: 'Analog console channel strip emulation with subtle harmonic saturation', author: 'Max Booster', grade: 'A', parameters: [{ id: 'drive', name: 'Drive', type: 'float', defaultValue: 0.3, minValue: 0, maxValue: 1, automatable: true }, { id: 'crosstalk', name: 'Crosstalk', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true }, { id: 'hiss', name: 'Hiss', type: 'float', defaultValue: 0.1, minValue: 0, maxValue: 1, automatable: true }, { id: 'output', name: 'Output', type: 'float', defaultValue: 0.8, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { drive: 0.3, crosstalk: 0.2, hiss: 0.1, output: 0.8 } };

export default MbMixConsolePlugin;
