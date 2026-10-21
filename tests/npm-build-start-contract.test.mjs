import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import http from "node:http";
import { spawn } from "node:child_process";
import { transformSync } from "esbuild";
import { validateBuild, writeBuildContract, readBuildInputs } from "../scripts/start-production.mjs";

test("production build aliases do not invoke missing fixers or prune the workspace", () => {
  const { scripts } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(scripts["build:full"], "npm run security:audit && npm run build");
  assert.equal(scripts["build:prod"], "npm run build");
  assert.equal(scripts["security-fix"], undefined);
});

test("a late build failure invalidates its completion marker", () => {
  const source = fs.readFileSync("script/build.ts", "utf8");
  const start = source.indexOf("main().catch((err) => {");
  assert.ok(start >= 0);
  const handler = source.slice(start + "main().catch((err) => {".length, source.lastIndexOf("});"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "failed-build-"));
  const failure = new Error("fixture packing failure");
  const exits = [];
  const logged = [];
  try {
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist/build-complete.json"), "{}");
    vm.runInNewContext(handler, { fs, path, root, err: failure,
      console: { error: (...args) => logged.push(args) },
      process: { exit: code => exits.push(code) } });
    assert.equal(fs.existsSync(path.join(root, "dist/build-complete.json")), false);
    assert.deepEqual(exits, [1]);
    assert.equal(logged[0][1], failure);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Python provisioning fails closed without deleting the existing runtime", () => {
  const source = fs.readFileSync("script/build.ts", "utf8");
  assert.match(source, /set -o pipefail; curl -fSL --retry 2 --connect-timeout 15/);
  const start = source.indexOf("} catch (e) {") + "} catch (e) {".length;
  const end = source.indexOf("\n    }\n  }", start);
  assert.ok(start > 12 && end > start);
  const failure = new Error("fixture provisioning failure");
  const code = transformSync(source.slice(start, end), { loader: "ts" }).code;
  assert.throws(() => vm.runInNewContext(code, { e: failure }), error =>
    error.message.includes("Required portable Python runtime provisioning failed") &&
    error.cause === failure);
});

test("DNS shutdown immediately signals its owned process group and cancels restart", () => {
  const source = fs.readFileSync("server/services/dnsNodeLocalSupervisor.ts", "utf8");
  const stop = source.slice(source.indexOf("export function stopDnsNodeLocal"));
  const signals = [];
  const cleared = [];
  const context = {
    shuttingDown: false, lastReady: true, lastReadyCheck: 10, restartTimer: 7,
    child: { pid: 321, kill() { throw new Error("Must not signal only the launcher"); } },
    logger: { info() {}, warn() {} },
    process: { kill(pid, signal) { signals.push([pid, signal]); } },
    clearTimeout(id) { cleared.push(id); },
    setTimeout() { return { unref() {} }; },
  };
  vm.runInNewContext(transformSync(stop.replace("export ", ""), { loader: "ts" }).code +
    "\nstopDnsNodeLocal(); stopDnsNodeLocal();", context);
  assert.deepEqual(signals, [[-321, "SIGTERM"]]);
  assert.deepEqual(cleared, [7]);
  assert.equal(context.child, null);
  assert.equal(context.shuttingDown, true);
});

test("DNS production startup uses a compiled entry, not tsx", () => {
  const supervisor = fs.readFileSync("server/services/dnsNodeLocalSupervisor.ts", "utf8");
  const bundles = fs.readFileSync("script/lib/serverBundles.ts", "utf8");
  assert.match(bundles, /"dns-node": "dns-node\/src\/index.ts"/);
  assert.match(supervisor, /production \? process.execPath : TSX_BIN/);
  assert.match(supervisor, /production \? path.resolve\(DNS_NODE_DIR, "\.\.\/dist\/dns-node.mjs"\) : "src\/index.ts"/);
});

test("embedded production MaxCore has a compiled entry and excludes the dashboard", () => {
  const build = fs.readFileSync("script/build.ts", "utf8");
  const supervisor = fs.readFileSync("server/services/maxcoreLocalSupervisor.ts", "utf8");
  const app = fs.readFileSync("external/maxcore/artifacts/api-server/src/app.ts", "utf8");
  assert.match(build, /external\/maxcore\/artifacts\/api-server/);
  assert.match(supervisor, /production \? process\.execPath : TSX_BIN/);
  assert.match(supervisor, /production \? "production" : "development"/);
  assert.match(supervisor, /MAXBOOSTER_EMBEDDED: "1"/);
  assert.match(supervisor, /MAXBOOSTER_PYTHON: process\.env\.MAXBOOSTER_PYTHON/);
  assert.match(supervisor, /path\.resolve\(process\.cwd\(\), "python_runtime", "bin", "python3"\)/);
  const start = supervisor.slice(supervisor.indexOf("export async function startMaxcoreLocal"));
  assert.ok(start.indexOf('if (process.env.NODE_ENV === "production")') < start.indexOf("if (fs.existsSync(TSX_BIN))"));
  assert.match(start, /Never attempt network installation/);
  assert.match(app, /NODE_ENV === "production" && process\.env\.MAXBOOSTER_EMBEDDED !== "1"/);
});

test("production startup rejects missing, altered and stale build output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-build-contract-"));
  try {
    assert.throws(() => validateBuild(root), /Run npm run build/);
    fs.mkdirSync(path.join(root, "dist/public"), { recursive: true });
    fs.mkdirSync(path.join(root, "external/maxcore/artifacts/api-server/dist"), { recursive: true });
    for (const file of ["package.json", "package-lock.json", "vite.config.ts", "start.sh",
      "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs", "dist/dns-node.mjs",
      "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
      "external/maxcore/artifacts/api-server/dist/index.mjs"]) {
      fs.writeFileSync(path.join(root, file), "fixture");
    }
    writeBuildContract(root);
    assert.doesNotThrow(() => validateBuild(root));
    fs.mkdirSync(path.join(root, "client"), { recursive: true });
    fs.writeFileSync(path.join(root, "client/index.html"), "<html></html>");
    assert.throws(() => validateBuild(root), /Source file list changed/);
    writeBuildContract(root);
    fs.writeFileSync(path.join(root, "client/index.html"), "<html>changed</html>");
    assert.throws(() => validateBuild(root), /Changed since build/);
    writeBuildContract(root);
    fs.rmSync(path.join(root, "dist/dns-node.mjs"));
    assert.throws(() => validateBuild(root), /Production build is missing/);
    fs.writeFileSync(path.join(root, "dist/dns-node.mjs"), "fixture");
    assert.doesNotThrow(() => validateBuild(root));
    fs.writeFileSync(path.join(root, "dist/index.mjs"), "modified");
    assert.throws(() => validateBuild(root), /Changed since build/);
    writeBuildContract(root);
    fs.mkdirSync(path.join(root, "server"));
    fs.writeFileSync(path.join(root, "server/new.ts"), "// new source");
    assert.throws(() => validateBuild(root), /Source file list changed/);
    assert.throws(() => writeBuildContract(root, {}), /changed during compilation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

 test("build input identity ignores nested dependency caches but tracks imported source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-input-cache-"));
  try {
    for (const file of ["package.json", "package-lock.json", "vite.config.ts", "start.sh"]) {
      fs.writeFileSync(path.join(root, file), "fixture");
    }
    const lib = path.join(root, "external/maxcore/lib/api-spec");
    fs.mkdirSync(path.join(lib, "node_modules/.cache/jiti"), { recursive: true });
    fs.writeFileSync(path.join(lib, "index.ts"), "export const version = 1;");
    const before = readBuildInputs(root);
    const cache = path.join(lib, "node_modules/.cache/jiti/generated.mjs");
    fs.writeFileSync(cache, "export default 1;");
    assert.deepEqual(readBuildInputs(root), before);
    fs.rmSync(cache);
    assert.deepEqual(readBuildInputs(root), before);
    fs.writeFileSync(path.join(lib, "index.ts"), "export const version = 2;");
    assert.notDeepEqual(readBuildInputs(root), before);
    fs.writeFileSync(path.join(lib, "added.ts"), "export default 1;");
    assert.ok(Object.hasOwn(readBuildInputs(root), "external/maxcore/lib/api-spec/added.ts"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("startup sidecar reuse probes the configured health listener", async t => {
  let status = 200;
  const server = http.createServer((_req, res) => { res.writeHead(status); res.end("ok"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const source = fs.readFileSync("start.sh", "utf8");
  const start = source.indexOf("_service_healthy() {");
  const helper = source.slice(start, source.indexOf("\n}\n", start) + 3);
  const probe = () => new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", helper + '\n_service_healthy "$CHECK_PORT"'], {
      env: { PATH: process.env.PATH, _NODE_BIN: process.execPath, CHECK_PORT: String(server.address().port) },
      stdio: "ignore",
    });
    child.once("error", reject); child.once("exit", resolve);
  });
  assert.equal(await probe(), 0);
  status = 503;
  assert.equal(await probe(), 1);
});
