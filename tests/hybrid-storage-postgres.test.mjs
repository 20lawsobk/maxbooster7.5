import { describe, before, after, it } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { defineHybridStorageContracts } from "./contracts/helpers-hybrid-storage-contracts.mjs";
// Keep the independently bundled boundary check; Vitest imports actual TS.
defineHybridStorageContracts({
  describe: (name, run) => describe(name, { timeout: 60000, concurrency: false }, run),
  beforeAll: before, afterAll: after, test: it,
}, async (cleanup) => {
  const directory = await mkdtemp(path.join(tmpdir(), "hybrid-storage-test-"));
  cleanup(() => rm(directory, { recursive: true, force: true }));
  const entry = path.join(directory, "entry.mjs");
  await writeFile(entry, [
    `export {HybridStorageService,parseLegacyHybridIndex} from ${JSON.stringify(path.resolve("server/services/hybridStorageService.ts"))};`,
    `export {HybridImmutableByteStore} from ${JSON.stringify(path.resolve("server/services/hybridImmutableByteStore.ts"))};`,
    `export {HybridStorageRepository} from ${JSON.stringify(path.resolve("server/services/hybridStorageRepository.ts"))};`,
  ].join("\n"));
  const mocks = {
    "../pocket-dimension/index.js": "export const pocketManager={openPocket(){throw Error('Only an injected fixture byte store is permitted')}};",
    "../lib/pdimClient.js": "export function getPdimClient(){throw Error('Only injected legacy bytes are permitted')}",
    "../db.js": "export const pool={query(){throw Error('Only the owned disposable SQL pool is permitted')}};",
  };
  const outfile = path.join(directory, "entry.cjs");
  await build({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "owned-hybrid-boundaries", setup(builder) {
          builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
        } }], logLevel: "silent" });
  // Resolve external installed packages without exposing application bindings.
  const { symlink } = await import("node:fs/promises");
  await symlink(path.resolve("node_modules"), path.join(directory, "node_modules"), "dir");
  return createRequire(import.meta.url)(outfile);
});
