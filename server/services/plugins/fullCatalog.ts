import {
  BUILT_IN_INSTRUMENTS,
  BUILT_IN_EFFECTS,
  type PluginDefinition,
} from "./definitions.js";
import MB_PLUGINS from "./mbCatalog.js";
import { enrichAll } from "./pluginEnrichment.js";

const mbIds = new Set(MB_PLUGINS?.map((p: PluginDefinition) => p?.id));

const builtInInstruments = BUILT_IN_INSTRUMENTS?.filter(
  (p: PluginDefinition) => !mbIds?.has(p?.id),
);
const builtInEffects = BUILT_IN_EFFECTS?.filter(
  (p: PluginDefinition) => !mbIds?.has(p?.id),
);

export const EXPANDED_INSTRUMENTS: PluginDefinition[] = enrichAll([
  ...builtInInstruments,
  ...MB_PLUGINS?.filter((p: PluginDefinition) => p?.category === "instrument"),
]);

export const EXPANDED_EFFECTS: PluginDefinition[] = enrichAll([
  ...builtInEffects,
  ...MB_PLUGINS?.filter((p: PluginDefinition) => p?.category === "effect"),
]);

export const ALL_PLUGINS: PluginDefinition[] = [
  ...EXPANDED_INSTRUMENTS,
  ...EXPANDED_EFFECTS,
];

export default ALL_PLUGINS;
