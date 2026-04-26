import type { PluginDefinition } from '../server/services/pluginHostService';

const MbPhaserClassicPlugin: PluginDefinition = { id: 'mb-phaser-classic', slug: 'mb-phaser-classic', name: 'MB Classic Phaser', category: 'effect', type: 'phaser', version: '1.0.0', description: '4-stage phaser', author: 'Max Booster', grade: 'A', parameters: [{ id: 'rate', name: 'Rate', type: 'float', defaultValue: 0.5, minValue: 0.01, maxValue: 10, automatable: true }, { id: 'depth', name: 'Depth', type: 'float', defaultValue: 0.7, minValue: 0, maxValue: 1, automatable: true }, { id: 'feedback', name: 'Feedback', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 0.99, automatable: true }, { id: 'mix', name: 'Mix', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { rate: 0.5, depth: 0.7, feedback: 0.5, mix: 0.5 } };

export default MbPhaserClassicPlugin;
