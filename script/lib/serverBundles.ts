import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";

export const SERVER_ENTRIES = {
  "dns-node": "dns-node/src/index.ts",
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
  await buildDeploymentBootstrap(root, outdir);
}

export async function buildDeploymentBootstrap(root: string, outdir: string) {
  // start.sh must run these before the application capsule is restored.
  const bootstrap = path.join(outdir, "deployment");
  fs.mkdirSync(bootstrap, { recursive: true });
  for (const name of fs.readdirSync(path.join(root, "script/deployment")).filter(name => name.endsWith(".mjs"))) {
    fs.copyFileSync(path.join(root, "script/deployment", name), path.join(bootstrap, name));
  }
  for (const file of ["scripts/port-contract.sh", "scripts/boot-stub-server.mjs", "script/deployment/image-size-gate.sh"]) {
    fs.copyFileSync(path.join(root, file), path.join(bootstrap, path.basename(file)));
  }
  let inPortTable = false;
  const portLines = fs.readFileSync(path.join(root, ".replit"), "utf8").split("\n").filter(line => {
    if (line.trim().startsWith("[")) inPortTable = line.trim() === "[[ports]]";
    return inPortTable;
  });
  if (!portLines.some(line => line.trim() === "[[ports]]")) throw new Error("Missing deployment port mapping");
  fs.writeFileSync(path.join(bootstrap, "ports.replit"), portLines.join("\n") + "\n");
  await build({ absWorkingDir: root, entryPoints: ["scripts/check-port-contract.ts"],
    outfile: path.join(bootstrap, "check-port-contract.mjs"), bundle: true,
    platform: "node", target: "node22", format: "esm" });

}