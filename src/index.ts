/**
 * Single-entry compatibility adapter for esbuild layouts that expect
 * `src/index.ts`. The canonical server implementation remains in server/index;
 * the production builder still emits every runtime entry and build contract.
 */
import "../server/index.js";
