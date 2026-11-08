import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const required = ["dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs",
  "dist/dns-node.mjs",
  "dist/compute-sizing.mjs", "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
  "external/maxcore/artifacts/api-server/dist/index.mjs"];
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function sourceInputs(root) {
  const files = ["package.json", "package-lock.json", "vite.config.ts", "start.sh"];
  function walk(dir) {
    if (!fs.existsSync(path.join(root, dir))) return;
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      // Dependencies are represented by lockfiles, not generated loader caches.
      // Imported workspace packages can have nested node_modules directories.
      if (entry.isDirectory() && entry.name !== "node_modules") walk(name);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs|sh)$/.test(name) ||
               (name.startsWith("shared/") && name.endsWith(".json"))) files.push(name);
    }
  }
  for (const dir of ["server", "client", "shared", "script", "scripts", "dns-node/src"]) walk(dir);
  for (const dir of ["external/maxcore/artifacts/api-server/src", "external/maxcore/lib"]) walk(dir);
  if (fs.existsSync(path.join(root, "external/maxcore/artifacts/api-server/build.ts"))) {
    files.push("external/maxcore/artifacts/api-server/build.ts");
  }
  for (const file of ["client/index.html", "dns-node/package.json", "dns-node/tsconfig.json",
    "tsconfig.json", "tsconfig.server.json", "tsconfig.client.json", ".replit",
    ...["external/maxcore", "external/pdim"].flatMap(dir =>
      ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].map(name => `${dir}/${name}`))]) {
    if (fs.existsSync(path.join(root, file))) files.push(file);
  }
  return files.sort();
}
export function readBuildInputs(root) {
  return Object.fromEntries(sourceInputs(root).map(f => [f, digest(path.join(root, f))]));
}
function publicBuildFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
      else throw new Error(`Unsupported public build asset: ${file}`);
    }
  }
  walk("dist/public");
  return files.sort();
}
export function writeBuildContract(root, expectedInputs) {
  // Include every emitted asset, not only the entry HTML.
  const files = [...required.filter(f => !f.startsWith("dist/public/")), ...publicBuildFiles(root)];
  for (const file of required) if (!files.includes(file)) throw new Error(`Missing artifact: ${file}`);
  const inputs = readBuildInputs(root);
  if (expectedInputs && JSON.stringify(inputs) !== JSON.stringify(expectedInputs)) {
    throw new Error("Source inputs changed during compilation; rebuild before starting");
  }
  fs.writeFileSync(path.join(root, "dist/build-complete.json"), JSON.stringify({
    version: 1, files: Object.fromEntries(files.map(f => [f, digest(path.join(root, f))])),
    inputs,
  }));
}

/**
 * Finalize a public-asset contract after deleting only verified compression
 * sidecars. The caller must validate the original contract immediately before
 * removal. Since the only post-validation mutation is unlinking the listed
 * sidecars, retained file hashes can be reused instead of reading the whole
 * asset tree a second time. Production startup still runs validateBuild() and
 * hashes every retained artifact before serving.
 */
export function finalizeBuildContractAfterPublicVariantRemoval(root, original, removedPaths) {
  if (!original || original.version !== 1 || !original.files ||
      typeof original.files !== "object" || Array.isArray(original.files) ||
      !original.inputs || typeof original.inputs !== "object" || Array.isArray(original.inputs)) {
    throw new Error("Cannot finalize an invalid production build contract");
  }
  if (!Array.isArray(removedPaths)) {
    throw new Error("Expected explicit removed public compression sidecars");
  }

  const current = JSON.parse(fs.readFileSync(path.join(root, "dist/build-complete.json"), "utf8"));
  if (JSON.stringify(current) !== JSON.stringify(original)) {
    throw new Error("Build contract changed during public asset finalization");
  }

  const removed = new Set();
  for (const file of removedPaths) {
    if (typeof file !== "string" || path.posix.normalize(file) !== file ||
        !file.startsWith("dist/public/") || !/\.(?:br|gz)$/i.test(file) ||
        !Object.hasOwn(original.files, file) || removed.has(file) ||
        fs.existsSync(path.join(root, file))) {
      throw new Error(`Refusing to finalize an unexpected public asset removal: ${String(file)}`);
    }
    removed.add(file);
  }
  if (removed.size === 0) {
    const expectedPublicFiles = Object.keys(original.files)
      .filter(file => file.startsWith("dist/public/"))
      .sort();
    if (JSON.stringify(publicBuildFiles(root)) !== JSON.stringify(expectedPublicFiles)) {
      throw new Error("Public build asset list changed without a verified sidecar removal");
    }
    return original;
  }

  const files = Object.fromEntries(
    Object.entries(original.files).filter(([file]) => !removed.has(file)),
  );
  for (const file of required) {
    if (!Object.hasOwn(files, file)) throw new Error(`Missing artifact after asset finalization: ${file}`);
  }
  const expectedPublicFiles = Object.keys(files)
    .filter(file => file.startsWith("dist/public/"))
    .sort();
  if (JSON.stringify(publicBuildFiles(root)) !== JSON.stringify(expectedPublicFiles)) {
    throw new Error("Public build asset list changed beyond the verified sidecar removals");
  }

  const finalized = { version: 1, files, inputs: original.inputs };
  const contractPath = path.join(root, "dist/build-complete.json");
  const temporaryPath = `${contractPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(finalized), { flag: "wx" });
    fs.renameSync(temporaryPath, contractPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  return finalized;
}

export function validateBuild(root) {
  try {
    const contract = JSON.parse(fs.readFileSync(path.join(root, "dist/build-complete.json"), "utf8"));
    if (contract.version !== 1) throw new Error("Unsupported build contract");
    const previousInputs = Object.keys(contract.inputs ?? {}).sort();
    const currentInputs = sourceInputs(root);
    if (JSON.stringify(previousInputs) !== JSON.stringify(currentInputs)) {
      // Report a bounded file-name diff without hashing files or displaying file contents.
      // This distinguishes an ordinary stale build from a missing build artifact.
      const previous = new Set(previousInputs);
      const current = new Set(currentInputs);
      const added = currentInputs.filter((file) => !previous.has(file));
      const removed = previousInputs.filter((file) => !current.has(file));
      const sample = (items) => items.slice(0, 5).join(", ") || "none";
      throw new Error(`Source file list changed since build (added: ${sample(added)}; removed: ${sample(removed)})`);
    }
    const expectedPublicFiles = Object.keys(contract.files ?? {}).filter(file => file.startsWith("dist/public/")).sort();
    if (JSON.stringify(publicBuildFiles(root)) !== JSON.stringify(expectedPublicFiles)) {
      throw new Error("Public build asset list changed since build");
    }
    for (const file of required) if (!contract.files?.[file]) throw new Error(`Missing artifact: ${file}`);
    for (const [file, hash] of Object.entries({ ...contract.files, ...contract.inputs })) {
      if (digest(path.join(root, file)) !== hash) throw new Error(`Changed since build: ${file}`);
    }
  } catch (error) {
    throw new Error(`Production build is missing, incomplete, or changed. Run npm run build. ${error.message}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    validateBuild(root);
    const port = process.env.PORT ?? "5000";
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("PORT must be an integer from 1 to 65535");
    // Reuse the production application handoff, including Python activation,
    // Rust sidecar and diffusion gateway. Only the capsule executive is skipped:
    // npm builds operate on already installed, unpacked dependencies.
    const child = spawn("bash", ["-c", 'source scripts/port-contract.sh; exec bash start.sh --executive-application'], {
      cwd: root, stdio: "inherit", detached: true,
      env: { ...process.env, NODE_ENV: "production", PORT: port, DEPLOY_NODE_BIN: process.execPath, DEPLOY_BOOT_STUB_PID: "" },
    });
    const stop = signal => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
    };
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
    child.on("error", error => { console.error(error.message); process.exitCode = 1; });
    child.on("exit", (code, signal) => { stop("SIGTERM"); process.exitCode = code ?? (signal ? 1 : 0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
