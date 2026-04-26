import type { PluginDefinition } from '../server/services/pluginHostService';

const MbRestoreDialoguePlugin: PluginDefinition = { id: 'mb-restore-dialogue', slug: 'mb-restore-dialogue', name: 'MB Dialogue Cleaner', category: 'effect', type: 'gate' as any, version: '1.0.0', description: 'Intelligent dialogue isolation and background noise removal', author: 'Max Booster', grade: 'A', parameters: [{ id: 'strength', name: 'Strength', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'focus', name: 'Focus', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }, { id: 'ambience', name: 'Ambience', type: 'float', defaultValue: 0.2, minValue: 0, maxValue: 1, automatable: true }, { id: 'attack', name: 'Attack', type: 'float', defaultValue: 5, minValue: 0.5, maxValue: 50, automatable: true }], defaultPreset: { strength: 0.5, focus: 0.5, ambience: 0.2, attack: 5 } };

export default MbRestoreDialoguePlugin;
