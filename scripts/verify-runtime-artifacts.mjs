// Read-only gates. Never installs, extracts, imports app code or contacts services.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ignore from "ignore";
import { inspectElectronBuilderTransport } from "./patch-electron-builder-transport.mjs";

export const floors = {
  "proxy-addr": "2.0.8", "source-map-js": "1.2.2", compression: "1.8.2",
  "fast-copy": "4.1.0", "postcss-selector-parser": "7.1.6",
  "@capacitor/android": "8.5.1", "@capacitor/ios": "8.5.1",
  "sprintf-js": null,
  axios: "1.20.0", fastify: "5.12.5", "ip-address": "10.7.3",
  undici: "7.30.0", electron: "43.7.7",
  // No patched release exists; certificate issuance must not pull this back in.
  "node-forge": null,
  // Their unpatched consumers have been removed or upgraded.
  braces: null,
  "http-cache-semantics": null,
  "fast-uri": "3.1.8", "js-yaml": "4.3.2", qs: "6.16.0",
  multer: "2.4.0", tar: "7.5.22", "@xmldom/xmldom": "0.9.12",
  esbuild: "0.28.1", "@esbuild/linux-x64": "0.28.1",
  orval: "8.33.0", "linkify-it": "5.0.2", sharp: "0.35.4",
  postcss: "8.5.23", browserslist: "4.28.7",
  "baseline-browser-mapping": "2.11.0", "@babel/core": "7.29.6",
  "brace-expansion": "5.0.12", nanoid: "3.3.18", uuid: "11.1.1",
  yaml: "2.8.3", dompurify: "3.4.16", "markdown-it": "14.3.1",
  vitest: "4.1.11", "@vitest/mocker": "4.1.11", "csv-parse": "7.0.2",
  // No patched release exists for the reported extract-zip advisories.
  // Keep it in the inventory so reintroduction fails rather than disappearing.
  "extract-zip": null,
};
const alternateFloors = {
  undici: { 6: "6.28.1" },
  "fast-uri": { 4: "4.1.5" },
  "linkify-it": { 6: "6.1.0" },
  "brace-expansion": { 2: "2.1.7" },
  nanoid: { 5: "5.1.16" },
  uuid: { 14: "14.0.2" },
  yaml: { 1: "1.10.3" },
};
const workspaces = [".", "external/maxcore", "external/pdim", "dns-os", "tls-proxy"];
const legacyWorkspaces = [
  "maxbooster7.5", "maxbooster7.5/dns-os", "maxbooster7.5/tls-proxy",
  "maxbooster7.5/maxbooster7.5", "maxbooster7.5/maxbooster7.5/dns-os", "maxbooster7.5/maxbooster7.5/tls-proxy",
];
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
function patched(version, floor) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const a = version.split(".").map(Number), b = floor.split(".").map(Number);
  // A new major is not a validated compatible remediation.
  return a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]));
}
export function inspectDependencies(root, scopes) {
  root = fs.realpathSync(root);
  // Legacy copies are optional in a fresh checkout, but every retained copy
  // participates in the same installed-tree checks when present.
  scopes ??= [...workspaces, ...legacyWorkspaces.filter(scope => fs.existsSync(path.join(root, scope)))];
  const failures = [], occurrences = [], resolutions = [], seen = new Set();
  function record(file, scope, consumer) {
    const real = fs.realpathSync(file);
    if (!inside(scope, real)) throw new Error(`dependency escaped workspace: ${file}`);
    const pkg = JSON.parse(fs.readFileSync(real, "utf8"));
    if (!Object.hasOwn(floors, pkg.name)) return;
    if (consumer !== "installed-tree") resolutions.push({ consumer, package: pkg.name, version: pkg.version, path: path.relative(root, real) });
    if (!seen.has(real)) {
      seen.add(real);
      occurrences.push({ package: pkg.name, version: pkg.version, path: path.relative(root, real), consumer });
      const floor = alternateFloors[pkg.name]?.[Number(pkg.version?.split(".")[0])] ?? floors[pkg.name];
      if (floor === null) failures.push(`${path.relative(root, real)}: ${pkg.name}@${pkg.version}; no patched release, upgrade the consuming dependency`);
      else if (!patched(pkg.version, floor)) failures.push(`${path.relative(root, real)}: ${pkg.name}@${pkg.version}; validated floor ${floor}`);
    }
  }
  for (const relative of scopes) {
    const scope = path.resolve(root, relative), modules = path.join(scope, "node_modules");
    try {
      if (!inside(root, fs.realpathSync(scope))) throw new Error("workspace escapes artifact");
      if (!fs.statSync(modules).isDirectory()) throw new Error("node_modules missing");
      const visited = new Set();
      function walk(dir) {
        const real = fs.realpathSync(dir);
        if (!inside(scope, real)) throw new Error(`installed tree escapes workspace: ${dir}`);
        if (visited.has(real)) return;
        visited.add(real);
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, item.name);
          try {
          if (item.name === "package.json" && item.isFile()) record(file, scope, "installed-tree");
          else if (item.isDirectory() || item.isSymbolicLink()) {
            // Traverse package directories and pnpm stores, not source file symlinks.
            if (fs.statSync(file).isDirectory()) walk(file);
          }
          } catch (error) { failures.push(`${path.relative(root, file)}: ${error.message}`); }
        }
      }
      walk(modules);
      const consumers = [scope, path.join(scope, "artifacts/api-server"), path.join(scope, "services/dns-api")].filter(dir => fs.existsSync(path.join(dir, "package.json")));
      for (const consumer of consumers) {
        const req = createRequire(path.join(consumer, "__runtime_gate__.cjs"));
        const manifest = JSON.parse(fs.readFileSync(path.join(consumer, "package.json"), "utf8"));
        for (const name of Object.keys(floors)) {
          // Resolve through Node's actual search order; no root fallback accepted.
          let found;
          for (const base of req.resolve.paths(name) ?? []) {
            const candidate = path.join(base, name, "package.json");
            if (fs.existsSync(candidate)) { found = candidate; break; }
          }
          if (found && (inside(scope, found) || manifest.dependencies?.[name])) record(found, scope, path.relative(root, consumer));
          else if (!found && manifest.dependencies?.[name]) failures.push(`${consumer}: missing declared dependency ${name}`);
        }
      }
    } catch (error) { failures.push(`${relative}: ${error.message}`); }
  }
  if (!occurrences.length) failures.push("No audited installed dependencies found");
  return { ready: failures.length === 0, failures, occurrences, resolutions };
}
// Build inputs include retained source copies that are not deployment payload.
// Keep the default workspace audit exhaustive; release checks may omit legacy
// scopes only when the actual image exclusion rules exclude their entire tree.
export function inspectDeploymentDependencies(root) {
  const matcher = ignore().add(fs.readFileSync(path.join(root, ".dockerignore"), "utf8"));
  const result = inspectDependencies(root, workspaces);
  try {
    const transport = inspectElectronBuilderTransport(root);
    if (transport.installed && !transport.patched) {
      result.failures.push("Electron packaging transport is unpatched; run scripts/patch-electron-builder-transport.mjs");
    }
  } catch (error) {
    result.failures.push(`Electron packaging transport: ${error.message}`);
  }
  for (const scope of legacyWorkspaces) {
    if (!matcher.ignores(`${scope}/`)) {
      result.failures.push(`${scope}: legacy workspace is not excluded from the deployment image`);
    }
  }
  result.ready = result.failures.length === 0;
  return result;
}
export async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function inspectArtifacts(root, capsules = ["node_modules", "python_runtime", "external_maxcore", "external_pdim", "app_remainder"]) {
  root = fs.realpathSync(root);
  const failures = [], evidence = {};
  for (const name of capsules) {
    try {
      const manifestFile = path.join(root, `${name}.manifest.json`);
      const archive = path.join(root, `${name}.pdim`);
      for (const file of [manifestFile, archive]) {
        if (!inside(root, fs.realpathSync(file))) throw new Error("artifact symlink escapes release");
      }
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      if (!/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error("invalid sha256");
      if (!["zstd-6", "zstd-19", "gzip-9", "xz-6", "xz-9", "xz-9e"].includes(manifest.compression)) throw new Error(`unsupported codec ${manifest.compression}`);
      if (!fs.statSync(archive).size) throw new Error("empty capsule");
      const actual = await digest(archive);
      if (actual !== manifest.sha256) throw new Error("capsule checksum mismatch");
      evidence[name] = { sha256: actual, manifestSha256: await digest(manifestFile) };
    } catch (error) { failures.push(`${name}: ${error.message}`); }
  }
  return { ready: failures.length === 0, failures, evidence };
}
export function inspectRestored(root, files = ["dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs", "dist/pdim-restore.mjs", "dist/public/index.html", "start.sh", ".node_bin/node", ".node_bin/provenance.json", "bin/boosterstate", "python_runtime/bin/python3"]) {
  const failures = [];
  for (const file of files) {
    try {
      const target = path.join(root, file);
      if (!inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error("escapes release");
      if (!fs.statSync(target).size) throw new Error("empty");
      if ([".node_bin/node", "bin/boosterstate", "python_runtime/bin/python3"].includes(file)) fs.accessSync(target, fs.constants.X_OK);
      if (file === ".node_bin/provenance.json") {
        const provenance = JSON.parse(fs.readFileSync(target, "utf8"));
        if (provenance.version !== "22.22.0" || provenance.platform !== "linux-x64" || !/^[a-f0-9]{64}$/.test(provenance.archiveSha256)) throw new Error("invalid pinned Node provenance");
      }
      if (file.endsWith(".mjs") || file.endsWith(".sh")) {
        const result = spawnSync(file.endsWith(".sh") ? "bash" : process.execPath,
          [file.endsWith(".sh") ? "-n" : "--check", target], { timeout: 15000, encoding: "utf8", env: { PATH: process.env.PATH } });
        if (result.error || result.status !== 0) throw new Error(`syntax check failed: ${result.error?.message ?? result.stderr}`);
      }
    } catch (error) { failures.push(`${file}: ${error.message}`); }
  }
  return { ready: failures.length === 0, failures };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2], root = path.resolve(process.argv[3] ?? ".");
    if (!["dependencies", "deployment-dependencies", "capsules", "restored"].includes(mode)) throw new Error("Usage: node scripts/verify-runtime-artifacts.mjs dependencies|deployment-dependencies|capsules|restored [root]");
    const result = mode === "dependencies" ? inspectDependencies(root)
      : mode === "deployment-dependencies" ? inspectDeploymentDependencies(root)
      : mode === "capsules" ? await inspectArtifacts(root) : inspectRestored(root);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ready ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}