// Isolated source tests: no application startup, DB, provider or network imports.
// Run: env -i PATH="$PATH" node --test tests/deployment-contracts.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { transformSync } = require("esbuild");
const logger = { info() {}, warn() {}, error() {}, debug() {} };
function load(file, mocks, extras = {}) {
  const { code } = transformSync(fs.readFileSync(file, "utf8"), { loader: "ts", format: "cjs", logLevel: "silent" });
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, console, structuredClone, Date,
    process: { env: {}, argv: ["node", file], cwd: () => process.cwd(), setMaxListeners() {}, on() {} },
    setInterval: () => ({ unref() {} }), clearInterval() {},
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (["path", "url", "fs"].includes(id)) return require(id);
      throw new Error(`Unmocked boundary: ${id}`);
    },
    ...extras,
  };
  vm.runInNewContext(code, context, { filename: file });
  return module.exports;
}
function sizing(memory, cpus = 8, env = {}, files = {}) {
  const disk = { readFileSync(file) {
    if (file in files) return files[file];
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  } };
  const osMock = { availableParallelism: () => cpus, totalmem: () => memory * 1024 ** 3 };
  const capacity = load("script/deployment/capacity.mjs", {"node:os":osMock,"node:fs":disk});
  return load("server/computeSizing.ts", {
    "../script/deployment/capacity.mjs": capacity,
    os: { availableParallelism: () => cpus, totalmem: () => memory * 1024 ** 3 },
    "node:fs": { readFileSync(file) {
      if (file in files) return files[file];
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    } },
  }, { process: { env } });
}
test("cgroup quotas bound physical CPU/RAM and override cannot bypass bounds", () => {
  const api = sizing(128, 64, { CLUSTER_WORKERS: "64" }, {
    "/sys/fs/cgroup/cpu.max": "400000 100000",
    "/sys/fs/cgroup/memory.max": String(16 * 1024 ** 3),
  });
  assert.equal(api.effectiveCapacity().cpus, 4);
  assert.equal(api.effectiveCapacity().memoryGB, 16);
  assert.throws(() => api.computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" }), /shared compute budget/);
});
test("disjoint pools fit under capacity; invalid overrides and impossible machines reject", () => {
  const api = sizing(32);
  const app = api.computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" });
  const ai = api.computeWorkerSizing({ envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS", reserveCore: false });
  assert.ok((app.freeMemGB + ai.freeMemGB) * 1024 + Object.values(app.reservationsMB).reduce((a,b) => a+b) <= 32 * 1024);
  assert.throws(() => sizing(2).computeWorkerSizing(), /Insufficient aggregate memory/);
  assert.throws(() => sizing(32, 8, { CLUSTER_WORKERS: "2oops" }).computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" }), /positive integer/);
});
test("4 effective CPUs / 8 GiB admit app, MaxCore and Python without overlap", () => {
  const api = sizing(128, 64, {}, {
    "/sys/fs/cgroup/cpu.max": "400000 100000",
    "/sys/fs/cgroup/memory.max": "8589934592",
  });
  const app = api.computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" });
  const ai = api.computeWorkerSizing({ envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS" });
  assert.equal(app.workerCount, 1);
  assert.equal(ai.workerCount, 1);
  assert.equal(app.primaryHeapMB, 512);
  assert.equal(app.pythonThreads, 1);
  assert.equal(app.pythonMemoryMB, 1024);
  assert.ok(app.workerHeapMB >= 512);
  const reserved = Object.values(app.reservationsMB).reduce((a,b) => a+b);
  assert.equal(app.workerMemoryMB + ai.workerMemoryMB + reserved, 8192);
  assert.ok(app.workerHeapMB + ai.workerHeapMB < app.workerMemoryMB + ai.workerMemoryMB);
});
test("role-specific minima are validated and small feasible CPU shares time-share", () => {
  assert.throws(() => sizing(8, 4, { PYTHON_MEMORY_MB: "7000" }).computeWorkerSizing(), /configured role minima/);
  assert.throws(() => sizing(8, 4, { APP_WORKER_MIN_MEMORY_MB: "0" }).computeWorkerSizing(), /positive finite/);
  const small = sizing(4, 2, {
    APP_PRIMARY_MEMORY_MB: "384", SIDECAR_MEMORY_MB: "256",
    PYTHON_MEMORY_MB: "512", APP_WORKER_MIN_MEMORY_MB: "768", MAXCORE_WORKER_MIN_MEMORY_MB: "512",
  });
  const app = small.computeWorkerSizing({ envOverrideVar: "CLUSTER_WORKERS" });
  const ai = small.computeWorkerSizing({ envOverrideVar: "MAXCORE_LOCAL_CLUSTER_WORKERS" });
  assert.equal(app.workerCount, 1);
  assert.equal(ai.workerCount, 1);
  assert.equal(app.primaryHeapMB, 256);
  assert.equal(app.cpuBudget, .5);
});
test("readiness publishes atomically, single-flights refreshes, expires and recovers", async () => {
  let now = 1000;
  class Clock extends Date { static now() { return now; } }
  const { startupProbes: p } = load("server/startup-probes.ts", {
    "./db.js": { db: {} }, "drizzle-orm": { sql() {} }, "./logger.js": { logger },
    "./lib/envHelpers.js": { isProductionEnv: () => false },
  }, { Date: Clock });
  let calls = 0;
  let release;
  p.checkDatabase = async () => { calls++; p.status.probes.database.status = "ready"; };
  p.checkRedis = async () => { p.status.probes.redis.status = "ready"; };
  p.checkMaxcore = async () => { p.status.probes.maxcore.status = "ready"; };
  await p.runAllProbes();
  assert.equal(p.isReady(), true);
  p.checkDatabase = async () => {
    calls++;
    p.status.probes.database.status = "checking";
    await new Promise(resolve => { release = resolve; });
    p.status.probes.database.status = "failed";
  };
  const a = p.runAllProbes();
  const b = p.runAllProbes();
  assert.equal(calls, 2);
  assert.equal(p.isReady(), true);
  assert.equal(p.getStatus().probes.database.status, "ready");
  now += 120001;
  assert.equal(p.isReady(), false);
  release();
  await Promise.all([a, b]);
  assert.equal(p.getStatus().phase, "failed");
  p.checkDatabase = async () => { p.status.probes.database.status = "ready"; };
  await p.runAllProbes();
  assert.equal(p.isReady(), true);
  const copy = p.getStatus();
  copy.probes.database.status = "failed";
  assert.equal(p.getStatus().probes.database.status, "ready");
  p.shutdown();
});
test("Sentry repeated never-successful sends cross 24h; success resets silence age", async () => {
  let now = 1000;
  let deliver = false;
  const timers = [];
  class Clock extends Date { static now() { return now; } }
  const sentry = { init() {}, captureMessage() {}, flush: async () => deliver };
  const api = load("server/instrument.ts", {
    module: { createRequire: () => () => sentry },
    "./logger.js": { logger }, "./config/env.js": { env: { SENTRY_DSN: "test-only" } },
  }, {
    Date: Clock,
    process: { env: { NODE_ENV: "production" }, setMaxListeners() {}, on() {} },
    setTimeout: fn => { timers.push(fn); return { unref() {} }; },
    setInterval: fn => { timers.push(fn); return { unref() {} }; },
  });
  api.startSentryHeartbeatMonitor();
  for (let hour = 0; hour <= 25; hour++) {
    now = 1000 + hour * 3600000;
    timers[0]();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(api.getSentryHeartbeatStatus().isSilent, true);
  deliver = true;
  timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.getSentryHeartbeatStatus().isSilent, false);
  deliver = false;
  now += 25 * 3600000;
  timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.getSentryHeartbeatStatus().isSilent, true);
});
test("Python respects the interpreter selected at the critical restore barrier", () => {
  const attempted = [];
  const api = load("server/services/pythonPath.ts", {
    child_process: { execFileSync: file => { attempted.push(file); return ""; } },
  }, { process: { env: { MAXBOOSTER_PYTHON: "/release/python/bin/python3" }, cwd: () => "/" } });
  assert.equal(api.PYTHON, "/release/python/bin/python3");
  assert.equal(api.PYTHON_AVAILABLE, true);
  assert.deepEqual(attempted, ["/release/python/bin/python3"]);
});
test("capsule restoration reuses only the matching generation and rejects corruption", async () => {
  const os = require("node:os"), path = require("node:path");
  const { createHash } = require("node:crypto");
  const { execFileSync } = require("node:child_process");
  const { pathToFileURL } = require("node:url");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-contract-"));
  try {
    fs.mkdirSync(path.join(root, "dist"));
    fs.copyFileSync("dist/pdim-restore.mjs", path.join(root, "dist/pdim-restore.mjs"));
    const { restoreCapsule } = await import(pathToFileURL(path.join(root, "dist/pdim-restore.mjs")).href);
    fs.mkdirSync(path.join(root, "fixture"));
    const manifest = path.join(root, "fixture.manifest.json");
    const archive = path.join(root, "fixture.pdim");
    const pack = text => {
      fs.writeFileSync(path.join(root, "fixture/data.txt"), text);
      execFileSync("tar", ["-czf", archive, "fixture"], { cwd: root });
      const sha256 = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
      fs.writeFileSync(manifest, JSON.stringify({ sha256, compression: "gzip-9" }));
      return sha256;
    };
    const first = pack("one");
    assert.equal(await restoreCapsule("fixture.pdim", "fixture.manifest.json", "fixture"), true);
    assert.equal(fs.readFileSync(path.join(root, "fixture/.pdim-restored"), "utf8"), first);
    const second = pack("two");
    fs.writeFileSync(path.join(root, "fixture/data.txt"), "old");
    assert.equal(await restoreCapsule("fixture.pdim", "fixture.manifest.json", "fixture"), true);
    assert.equal(fs.readFileSync(path.join(root, "fixture/data.txt"), "utf8"), "two");
    assert.equal(fs.readFileSync(path.join(root, "fixture/.pdim-restored"), "utf8"), second);
    // A matching warm sentinel must not hide changed/corrupt capsule bytes.
    const goodArchive = fs.readFileSync(archive);
    fs.appendFileSync(archive, "corrupt");
    assert.equal(await restoreCapsule("fixture.pdim", "fixture.manifest.json", "fixture"), false);
    assert.equal(fs.readFileSync(path.join(root, "fixture/data.txt"), "utf8"), "two");
    fs.writeFileSync(archive, goodArchive);
    // Preserve compatibility with the historical publishing codec as well as
    // the bounded compressor used by the current build.
    for (const compression of ["xz-9e", "xz-6"]) {
      fs.writeFileSync(path.join(root, "fixture/data.txt"), compression);
      execFileSync("tar", ["-cJf", archive, "fixture"], {
        cwd: root, env: { ...process.env, XZ_OPT: "-0 -T1", XZ_DEFAULTS: "" },
      });
      const sha256 = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
      fs.writeFileSync(manifest, JSON.stringify({ sha256, compression }));
      assert.equal(await restoreCapsule("fixture.pdim", "fixture.manifest.json", "fixture"), true);
      assert.equal(fs.readFileSync(path.join(root, "fixture/data.txt"), "utf8"), compression);
    }
    fs.writeFileSync(manifest, JSON.stringify({ sha256: "0".repeat(64), compression: "gzip-9" }));
    assert.equal(await restoreCapsule("fixture.pdim", "fixture.manifest.json", "fixture"), false);
    assert.equal(fs.readFileSync(path.join(root, "fixture/data.txt"), "utf8"), "xz-6");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test("build verifies dependencies without fetching package managers; explicit synchronization is offline", () => {
  const script = fs.readFileSync("script/sync-subsystem-dependencies.sh", "utf8");
  assert.match(script, /PNPM_VERSION=.*10[.]26[.]1/);
  assert.doesNotMatch(script, /npm exec|npx /);
  assert.match(script, /SUBSYSTEM_INSTALL/);
  assert.match(script, /command -v pnpm/);
  assert.match(script, /CI=true run_pnpm install --offline --frozen-lockfile --ignore-scripts/);
});

test("capsule --verify checks all build archives read-only and rejects corrupt bytes", t => {
  const os = require("node:os");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const { execFileSync, spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pdim-readonly-verify-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist);
  const restoreScript = path.join(dist, "pdim-restore.mjs");
  fs.copyFileSync("dist/pdim-restore.mjs", restoreScript);

  const capsules = [
    ["app_remainder.pdim", "app_remainder.manifest.json", "app-remainder"],
    ["node_modules.pdim", "node_modules.manifest.json", "node_modules"],
    ["python_runtime.pdim", "python_runtime.manifest.json", "python_runtime"],
    ["external_maxcore.pdim", "external_maxcore.manifest.json", "external/maxcore"],
    ["external_pdim.pdim", "external_pdim.manifest.json", "external/pdim"],
  ];
  const inputs = path.join(root, "fixture-input");
  for (const [capsule, manifest, member] of capsules) {
    const payload = path.join(inputs, member);
    fs.mkdirSync(payload, { recursive: true });
    fs.writeFileSync(path.join(payload, "payload.txt"), capsule);
    if (capsule === "node_modules.pdim") {
      for (let index = 0; index < 500; index++) {
        fs.writeFileSync(path.join(payload, `entry-${index}.txt`), "fixture");
      }
    }
    const archive = path.join(root, capsule);
    execFileSync("tar", ["-czf", archive, "-C", inputs, member], { cwd: root });
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    fs.writeFileSync(path.join(root, manifest), JSON.stringify({ sha256, compression: "gzip-9" }));
  }

  function snapshot(directory) {
    const result = [];
    function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        const relative = path.relative(directory, absolute);
        if (entry.isDirectory()) {
          result.push(`${relative}/`);
          walk(absolute);
        } else {
          result.push(`${relative}:${crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex")}`);
        }
      }
    }
    walk(directory);
    return result.sort();
  }

  const before = snapshot(root);
  const verified = spawnSync(process.execPath, [restoreScript, "--verify"], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(verified.status, 0, verified.stderr + verified.stdout);
  assert.match(verified.stdout, /Read-only verification passed for 5 capsules/);
  assert.deepEqual(snapshot(root), before, "verification must not create, remove, or alter files");

  fs.appendFileSync(path.join(root, capsules[0][0]), "corruption");
  const corrupt = spawnSync(process.execPath, [restoreScript, "--verify"], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(corrupt.status, 1, corrupt.stderr + corrupt.stdout);
  assert.match(corrupt.stderr, /Checksum mismatch for app_remainder\.pdim/);
  for (const target of ["node_modules", "python_runtime", "external", ".pdim-restored-app"]) {
    assert.equal(fs.existsSync(path.join(root, target)), false, `${target} must not be restored`);
  }
});

test("unknown capsule restore modes fail closed instead of restoring everything", t => {
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pdim-unknown-mode-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "dist"));
  const restoreScript = path.join(root, "dist", "pdim-restore.mjs");
  fs.copyFileSync("dist/pdim-restore.mjs", restoreScript);
  const result = spawnSync(process.execPath, [restoreScript, "--unknown"], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.match(result.stderr, /Unknown mode: --unknown/);
  assert.deepEqual(fs.readdirSync(root).sort(), ["dist"]);
});

test("deployment finalization invokes read-only capsule verification", () => {
  const build = fs.readFileSync("build.sh", "utf8");
  const finalize = build.split("phase_finalize() {")[1]?.split("\n}")[0];
  assert.ok(finalize, "phase_finalize must exist");
  assert.match(finalize, /require_file dist\/pdim-restore\.mjs/);
  assert.match(finalize, /node dist\/pdim-restore\.mjs --verify/);
});
