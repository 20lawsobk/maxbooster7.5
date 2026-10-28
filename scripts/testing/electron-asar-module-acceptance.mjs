/** Real Electron ASAR module-resolution acceptance. Explicit native runtime only.
 * node scripts/testing/electron-asar-module-acceptance.mjs --electron-binary /path/to/electron [--output-json /new/report.json]
 * No downloading, installed-tree mutation, application credentials or network.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
// Match electron-builder's real stream-writer API. The older crawler API uses
// callback-style glob, which is incompatible with this graph's modern Glob.
function archiveStreams(root, relative = "") {
  const result = [];
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, item.name), file = path.join(root, name);
    if (item.isDirectory()) {
      result.push({ path: name, type: "directory", unpacked: false });
      result.push(...archiveStreams(root, name));
    } else {
      assert.ok(item.isFile(), "Owned archive fixture contains regular files only");
      result.push({ path: name, type: "file", stat: fs.statSync(file), unpacked: name === path.join("dist", "index.mjs"), streamGenerator: () => fs.createReadStream(file) });
    }
  }
  return result;
}
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index], value = process.argv[index + 1];
  assert.ok(["--electron-binary", "--output-json"].includes(flag) && value && !options[flag], "Use --electron-binary /absolute/runtime [--output-json /new/report.json]");
  options[flag] = value;
}
assert.ok(options["--electron-binary"] && path.isAbsolute(options["--electron-binary"]), "An explicit absolute Electron binary is required; this test never auto-installs it");
const binary = fs.realpathSync(options["--electron-binary"]);
assert.ok(fs.statSync(binary).isFile());
const reportFile = options["--output-json"] ? path.resolve(options["--output-json"]) : null;
if (reportFile) assert.equal(fs.existsSync(reportFile), false, "Preserve previous receipts; use a new output file");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "maxbooster-asar-module-"));
const digest = value => createHash("sha256").update(value).digest("hex");
const report = { schemaVersion: 1, scope: "Real Electron ASAR loader with the actual installed Zod package; not application or provider end-to-end acceptance", status: "running", productionReady: false,
  startedAt: new Date().toISOString(), electronBinary: binary, phases: [], cleanup: { ownedFixtureRemoved: false } };

try {
  const source = path.join(directory, "source"), resources = path.join(directory, "resources");
  fs.mkdirSync(path.join(source, "dist"), { recursive: true });
  fs.mkdirSync(path.join(source, "electron"));
  fs.mkdirSync(path.join(source, "node_modules"));
  fs.mkdirSync(resources);
  const helper = path.join(root, "electron/runtime-policy.cjs");
  fs.copyFileSync(helper, path.join(source, "electron/runtime-policy.cjs"));
  fs.writeFileSync(path.join(source, "package.json"), '{"name":"owned-real-asar-acceptance","type":"module"}\n');
  fs.writeFileSync(path.join(source, "electron/package.json"), '{"type":"commonjs"}\n');
  const zodRoot = path.dirname(require.resolve("zod/package.json"));
  const zodManifest = JSON.parse(fs.readFileSync(path.join(zodRoot, "package.json"), "utf8"));
  fs.cpSync(zodRoot, path.join(source, "node_modules/zod"), { recursive: true, dereference: true, errorOnExist: true });
  fs.writeFileSync(path.join(source, "dist/index.mjs"), `import { z } from "zod";
const schema = z.object({ title: z.string(), count: z.number().int().positive() });
const value = schema.parse({ title: "東京 🎹", count: 7 });
if (schema.safeParse({ title: "bad", count: -1 }).success) throw Error("Actual Zod rejected no invalid input");
console.log(JSON.stringify({ marker: "actual-zod-loaded", value, cwd: process.cwd(), entry: import.meta.url }));\n`);
  const archive = path.join(resources, "app.asar");
  await asar.createPackageFromStreams(archive, archiveStreams(source));
  assert.equal(asar.statFile(archive, "dist/index.mjs").unpacked, true);
  assert.equal(asar.statFile(archive, "node_modules/zod/package.json").unpacked, undefined);
  const physical = path.join(archive + ".unpacked", "dist/index.mjs");
  const virtual = path.join(archive, "dist/index.mjs");
  assert.ok(fs.existsSync(physical));
  const env = { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory, LANG: "C.UTF-8", ELECTRON_RUN_AS_NODE: "1" };
  if (process.env.LD_LIBRARY_PATH) env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH;
  const execute = (name, args, cwd) => {
    const before = Date.now();
    const result = spawnSync(binary, args, { cwd, env, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    const observed = { name, args, cwd, exitCode: result.status, signal: result.signal,
      durationMs: Date.now() - before, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error?.message || null };
    report.phases.push(observed);
    assert.equal(result.error, undefined, `${name} must execute without timeout or spawn error`);
    return observed;
  };
  const before = execute("physical-unpacked-entry-before", [physical], path.dirname(physical));
  assert.notEqual(before.exitCode, 0, "The physical entry must demonstrate the missing archive-parent dependency");
  assert.match(before.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.match(before.stderr, /Cannot find package 'zod'/);
  const selector = `const p = require(${JSON.stringify(path.join(archive, "electron/runtime-policy.cjs"))});
const selected = p.resolveDesktopServer({ appDirectory: ${JSON.stringify(path.join(archive, "electron"))}, resourcesDirectory: ${JSON.stringify(resources)} });
console.log(JSON.stringify({ selected, versions: { node: process.versions.node, electron: process.versions.electron, chrome: process.versions.chrome } }));`;
  const selected = execute("actual-electron-helper-selection", ["-e", selector], resources);
  assert.equal(selected.exitCode, 0, selected.stderr);
  const selection = JSON.parse(selected.stdout.trim());
  assert.deepEqual(selection.selected, { entry: virtual, cwd: resources });
  const after = execute("virtual-asar-entry-after", [selection.selected.entry], selection.selected.cwd);
  assert.equal(after.exitCode, 0, after.stderr);
  const output = JSON.parse(after.stdout.trim());
  assert.equal(output.marker, "actual-zod-loaded");
  assert.deepEqual(output.value, { title: "東京 🎹", count: 7 });
  assert.equal(output.cwd, resources);
  assert.ok(output.entry.includes("app.asar/dist/index.mjs"));
  Object.assign(report, { status: "passed", actualZodVersion: zodManifest.version,
    helperSha256: digest(fs.readFileSync(helper)), archiveSha256: digest(fs.readFileSync(archive)),
    runtime: selection.versions, physicalBeforeFailed: true, realVirtualModuleAfterPassed: true,
    physicalWorkingDirectoryVerified: true, appCredentialsPassedToChild: false });
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
  report.cleanup.ownedFixtureRemoved = !fs.existsSync(directory);
  if (reportFile) {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify(report, null, 2));
}
