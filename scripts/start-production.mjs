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
      if (entry.isDirectory()) walk(name);
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
    "tsconfig.json", "tsconfig.server.json", "tsconfig.client.json",
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
export function validateBuild(root) {
  try {
    const contract = JSON.parse(fs.readFileSync(path.join(root, "dist/build-complete.json"), "utf8"));
    if (contract.version !== 1) throw new Error("Unsupported build contract");
    if (JSON.stringify(Object.keys(contract.inputs ?? {}).sort()) !== JSON.stringify(sourceInputs(root))) throw new Error("Source file list changed since build");
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
