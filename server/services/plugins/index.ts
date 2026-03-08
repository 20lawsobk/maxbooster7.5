import type { PluginDefinition } from '../pluginHostService';
import { ALL_PLUGINS } from '../../../built-in plugins dsp/index';

export const EXPANDED_INSTRUMENTS: PluginDefinition[] = ALL_PLUGINS.filter(p => p.category === 'instrument');
export const EXPANDED_EFFECTS: PluginDefinition[] = ALL_PLUGINS.filter(p => p.category === 'effect');

export { ALL_PLUGINS };
export default ALL_PLUGINS;
