import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const { resolveDesktopServer } = require("../electron/runtime-policy.cjs");

function archiveStreams(root, unpackedEntry, relative = "") {
  const result = [];
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, item.name), file = path.join(root, name);
    if (item.isDirectory()) {
      result.push({ path: name, type: "directory", unpacked: false });
      result.push(...archiveStreams(root, unpackedEntry, name));
    } else {
      assert.ok(item.isFile(), "Owned archive fixture contains regular files only");
      result.push({ path: name, type: "file", stat: fs.statSync(file), unpacked: name === unpackedEntry, streamGenerator: () => fs.createReadStream(file) });
    }
  }
  return result;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop launch policy "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, text = "export {};\n") => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  };
  return { root, write };
}

test("development launch prefers the real ESM entry and retains its physical cwd", t => {
  const { root, write } = fixture(t);
  const esm = write("application/dist/index.mjs");
  write("application/dist/index.cjs", "module.exports = {};\n");
  const selected = resolveDesktopServer({ appDirectory: path.join(root, "application/electron"), resourcesDirectory: path.join(root, "resources") });
  assert.deepEqual(selected, { entry: esm, cwd: path.dirname(esm) });
});

test("development launch admits a real CJS-only entry", t => {
  const { root, write } = fixture(t);
  const cjs = write("application/dist/index.cjs", "module.exports = {};\n");
  assert.deepEqual(resolveDesktopServer({ appDirectory: path.join(root, "application/electron"), resourcesDirectory: path.join(root, "resources") }),
    { entry: cjs, cwd: path.dirname(cjs) });
});

test("a missing bundled server is explicit rather than an invented path", t => {
  const { root } = fixture(t);
  assert.equal(resolveDesktopServer({ appDirectory: path.join(root, "missing/electron"), resourcesDirectory: path.join(root, "resources") }), null);
});

for (const extension of ["mjs", "cjs"]) {
  test(`real ASAR metadata keeps ${extension} module ancestry virtual and cwd physical`, async t => {
    const { root, write } = fixture(t);
    write("input/electron/package.json", '{"type":"commonjs"}\n');
    write(`input/dist/index.${extension}`, extension === "mjs" ? "export {};\n" : "module.exports = {};\n");
    const resources = path.join(root, "resources");
    fs.mkdirSync(resources);
    const archive = path.join(resources, "app.asar");
    await asar.createPackageFromStreams(archive, archiveStreams(path.join(root, "input"), path.join("dist", `index.${extension}`)));
    assert.equal(asar.statFile(archive, `dist/index.${extension}`).unpacked, true);
    const virtual = path.join(archive, `dist/index.${extension}`);
    const physical = path.join(archive + ".unpacked", `dist/index.${extension}`);
    assert.equal(fs.existsSync(physical), true);
    // Ordinary Node has no Electron ASAR filesystem patch. This adapter reads
    // the actual archive header; native module execution is verified separately
    // by scripts/testing/electron-asar-module-acceptance.mjs.
    const exists = file => {
      if (file.startsWith(archive + path.sep)) {
        try { return Boolean(asar.statFile(archive, path.relative(archive, file))); }
        catch { return false; }
      }
      return fs.existsSync(file);
    };
    const selected = resolveDesktopServer({ appDirectory: path.join(archive, "electron"), resourcesDirectory: resources }, exists);
    assert.deepEqual(selected, { entry: virtual, cwd: resources });
    assert.equal(fs.statSync(selected.cwd).isDirectory(), true);
    assert.equal(fs.readFileSync(physical).toString(), asar.extractFile(archive, `dist/index.${extension}`).toString());
  });
}

test("a physical unpacked fallback retains a real directory when no virtual entry exists", t => {
  const { root, write } = fixture(t);
  const physical = write("resources/app.asar.unpacked/dist/index.mjs");
  assert.deepEqual(resolveDesktopServer({ appDirectory: path.join(root, "missing/electron"), resourcesDirectory: path.join(root, "resources") }),
    { entry: physical, cwd: path.dirname(physical) });
});

// Exercise the installed builder's real node-module filtering and the actual
// node-gyp-build selection order. Host-specific rebuilds must not shadow the
// platform prebuilds published by bcrypt in a distributed desktop artifact.
const { getNodeModuleFileMatcher } = require("app-builder-lib/out/fileMatcher.js");
const nativeLoader = require("node-gyp-build");
const manifestRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const currentManifest = JSON.parse(fs.readFileSync(path.join(manifestRoot, "package.json")));
const legacyBundle = JSON.parse(fs.readFileSync(path.join(manifestRoot, "tools/legacy-security-update.json")));
const manifests = [["root", currentManifest], ...legacyBundle.files
  .filter(item => ["maxbooster7.5/package.json", "maxbooster7.5/maxbooster7.5/package.json"].includes(item.path))
  .map(item => [item.path, JSON.parse(item.content)])];
for (const [name, manifest] of manifests) {
  test(`${name}: packaged bcrypt keeps published platform prebuilds and rejects host-specific rebuild shadowing`, t => {
    const { root } = fixture(t), input = path.join(root, "input"), output = path.join(root, "output");
    const source = path.join(input, "node_modules/bcrypt"), target = path.join(output, "node_modules/bcrypt");
    const installed = path.dirname(require.resolve("bcrypt/package.json"));
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.cpSync(installed, source, { recursive: true });
    const shadow = path.join(source, "build/Release/host-specific.node");
    fs.mkdirSync(path.dirname(shadow), { recursive: true });
    fs.writeFileSync(shadow, "Deliberately invalid native rebuild; never execute this fixture file");
    assert.equal(nativeLoader.path(source), shadow, "Actual loader gives a local rebuild priority before packaging");
    const matcher = getNodeModuleFileMatcher(input, output, value => value, {}, {
      config: manifest.build, debugLogger: { isEnabled: false },
    }).createFilter();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, filter: file => matcher(file, fs.statSync(file)) });
    assert.equal(fs.existsSync(path.join(target, "build/Release/host-specific.node")), false);
    const published = fs.readdirSync(path.join(installed, "prebuilds"), { recursive: true })
      .filter(file => file.endsWith(".node"));
    assert.ok(published.length > 0, "The installed bcrypt package must provide actual published binaries");
    for (const relative of published) {
      assert.deepEqual(fs.readFileSync(path.join(target, "prebuilds", relative)),
        fs.readFileSync(path.join(installed, "prebuilds", relative)), `Preserve published binary ${relative}`);
    }
    const selected = nativeLoader.path(target);
    assert.ok(selected.startsWith(path.join(target, "prebuilds") + path.sep), "Actual default loader must choose a published prebuild");
    assert.equal(fs.statSync(selected).isFile(), true);
  });
}
