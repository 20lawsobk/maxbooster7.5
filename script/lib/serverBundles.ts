import path from "node:path";
import { build } from "esbuild";

export const SERVER_ENTRIES = {
  index: "server/index.ts",
  "retained-pdim-recovery-worker": "scripts/retained-pdim-recovery-worker.ts",
  cluster: "server/cluster.ts",
  gateway: "server/diffusion-gateway/index.ts",
  "compute-sizing": "server/computeSizing.ts",
};

/** One graph scan; independent entry bundles, unchanged external dependencies.
 * No shared output chunks: each bootstrap remains independently executable. */
export async function buildServerBundles(root: string, outdir = path.join(root, "dist")) {
  await build({
    absWorkingDir: root,
    entryPoints: SERVER_ENTRIES,
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    splitting: false,
    platform: "node",
    target: "node22",
    format: "esm",
    packages: "external",
    sourcemap: false,
    minify: false,
  });
}