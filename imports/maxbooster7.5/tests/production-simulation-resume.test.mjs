import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SIMULATION_CAPSULES, validateSimulationResume } from "../scripts/lib/production-simulation-resume.mjs";

const sourceRoot = path.resolve(import.meta.dirname, "..");
const sha = "a".repeat(64);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sim-resume-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runsRoot = path.join(root, ".local/production-simulation/runs");
  const workspace = path.join(runsRoot, "fixture-run");
  const copyRoot = path.join(workspace, "app");
  const logsRoot = path.join(workspace, "logs");
  fs.mkdirSync(copyRoot, { recursive: true });
  fs.mkdirSync(logsRoot);
  const state = { runId: "fixture-run", workspace, copyRoot, completed: ["copy"] };
  const report = {
    runId: state.runId, completedStages: ["copy"],
    copyIntegrity: { checked: [{ path: "node_modules/tsx/package.json" }, { path: "server/index.ts" }] },
    configValidation: { checked: [{ path: "start.sh" }] },
  };
  const write = (file, text = "fixture\n", base = copyRoot) => {
    fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
    fs.writeFileSync(path.join(base, file), text);
  };
  for (const file of [
    ".simulation-copy-complete", "package.json", "script/build.ts", "start.sh",
    "dist/pdim-restore.mjs", "node_modules/tsx/package.json", "server/index.ts",
  ]) write(file);
  const stages = (...completed) => {
    state.completed = completed;
    report.completedStages = [...completed];
  };
  const validate = (options = {}) => validateSimulationResume({ state, report, runsRoot, ...options });
  const pack = () => {
    // Model build.ts's destructive source removal, including the copy
    // sentinel and package.json inside app_remainder (not bootstrap files).
    for (const file of [".simulation-copy-complete", "package.json", "script", "server", "node_modules"]) {
      fs.rmSync(path.join(copyRoot, file), { recursive: true, force: true });
    }
    for (const file of [".node_bin/node", "scripts/boot-stub-server.mjs", "scripts/port-contract.sh", "scripts/check-port-contract.ts"]) write(file);
    for (const capsule of SIMULATION_CAPSULES) {
      write(`${capsule}.pdim`);
      write(`${capsule}.manifest.json`, JSON.stringify({ sha256: sha }));
    }
    stages("copy", "build");
  };
  const restore = () => {
    for (const file of [
      "node_modules/.pdim-restored", ".pdim-restored-app-remainder",
      "python_runtime/.pdim-restored-py", "external/maxcore/.pdim-restored-maxcore",
      "external/pdim/.pdim-restored-pdim",
    ]) write(file, sha);
    for (const file of [
      "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs",
      "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
      "node_modules/tsx/package.json", "python_runtime/bin/python3.12",
      "external/maxcore/artifacts/ai-training-server/server.py",
      "external/pdim/artifacts/api-server/src/index.ts",
    ]) write(file);
    stages("copy", "build", "size", "restore");
  };
  return { root, runsRoot, workspace, copyRoot, logsRoot, state, report, write, stages, validate, pack, restore };
}

test("copy-complete resume checks the copy sentinel and recorded raw inputs", t => {
  const f = fixture(t);
  assert.ok(f.validate().requiredArtifacts.includes(".simulation-copy-complete"));
  fs.unlinkSync(path.join(f.copyRoot, ".simulation-copy-complete"));
  assert.throws(f.validate, /missing.*simulation-copy-complete/);
  f.write(".simulation-copy-complete");
  fs.unlinkSync(path.join(f.copyRoot, "server/index.ts"));
  assert.throws(f.validate, /missing.*server\/index.ts/);
});

for (const name of ["app", "logs"]) {
  for (const kind of ["missing", "dangling", "outside"]) {
    test(`reject ${kind} ${name} without recreating it`, t => {
      const f = fixture(t);
      const target = path.join(f.workspace, name);
      fs.rmSync(target, { recursive: true });
      if (kind !== "missing") {
        const external = path.join(f.root, kind);
        if (kind === "outside") fs.mkdirSync(external);
        fs.symlinkSync(external, target);
      }
      assert.throws(f.validate, kind === "outside" ? /escapes workspace/ : /missing or dangling/);
      assert.equal(fs.existsSync(target), kind === "outside");
      assert.doesNotThrow(() => f.validate({ cleanup: true }));
    });
  }
}

test("packed build/size select capsules and bootstrap, not consumed copy inputs or restore markers", t => {
  const f = fixture(t);
  f.pack();
  for (const completed of [["copy", "build"], ["copy", "build", "size"]]) {
    f.stages(...completed);
    const selected = f.validate().requiredArtifacts;
    assert.ok(selected.includes("app_remainder.pdim"));
    assert.ok(selected.includes(".node_bin/node"));
    assert.ok(!selected.includes("package.json"));
    assert.ok(!selected.includes(".simulation-copy-complete"));
    assert.ok(!selected.includes("node_modules/.pdim-restored"));
    assert.ok(!fs.existsSync(path.join(f.copyRoot, "package.json")));
  }
  fs.unlinkSync(path.join(f.copyRoot, "external_pdim.manifest.json"));
  assert.throws(f.validate, /missing.*external_pdim.manifest.json/);
});

test("bounded post-pack recovery uses packed artifacts even before build stage persists", t => {
  const f = fixture(t);
  f.pack();
  f.stages("copy");
  f.write("phased-build-complete.json", "{}", f.workspace);
  assert.ok(f.validate().requiredArtifacts.includes("node_modules.pdim"));
  fs.unlinkSync(path.join(f.copyRoot, "app_remainder.pdim"));
  assert.throws(f.validate, /missing.*app_remainder.pdim/);
});

for (const capsule of SIMULATION_CAPSULES) {
  test(`completed build rejects lost ${capsule} capsule`, t => {
    const f = fixture(t);
    f.pack();
    fs.unlinkSync(path.join(f.copyRoot, `${capsule}.pdim`));
    assert.throws(f.validate, /missing.*\.pdim/);
  });
}

test("completed build rejects malformed capsule manifest", t => {
  const f = fixture(t);
  f.pack();
  f.write("app_remainder.manifest.json", "{}");
  assert.throws(f.validate, /invalid required manifest checksum/);
});

test("completed restore/startup require real payload plus current manifest-linked sentinels", t => {
  const f = fixture(t);
  f.pack();
  f.restore();
  for (const completed of [["copy", "build", "size", "restore"], ["copy", "build", "size", "restore", "startup"]]) {
    f.stages(...completed);
    assert.ok(f.validate().requiredArtifacts.includes("dist/cluster.mjs"));
  }
  f.write("python_runtime/.pdim-restored-py", "stale");
  assert.throws(f.validate, /stale restored sentinel/);
  f.write("python_runtime/.pdim-restored-py", sha);
  fs.unlinkSync(path.join(f.copyRoot, "dist/cluster.mjs"));
  assert.throws(f.validate, /missing.*dist\/cluster.mjs/);
});

test("interrupted destructive restore does not demand not-yet-completed restoration", t => {
  const f = fixture(t);
  f.pack();
  f.restore();
  f.stages("copy", "build", "size");
  f.state.stage = "restore";
  f.state.status = "running";
  fs.rmSync(path.join(f.copyRoot, "node_modules"), { recursive: true });
  fs.unlinkSync(path.join(f.copyRoot, ".pdim-restored-app-remainder"));
  assert.doesNotThrow(f.validate);
});

test("cleanup ignores lost payload, but rejects arbitrary state workspace paths", t => {
  const f = fixture(t);
  fs.rmSync(f.workspace, { recursive: true });
  assert.throws(f.validate, /missing or dangling/);
  assert.doesNotThrow(() => f.validate({ cleanup: true }));
  fs.symlinkSync(path.join(f.root, "lost-target"), f.workspace);
  assert.throws(f.validate, /missing or dangling/);
  assert.doesNotThrow(() => f.validate({ cleanup: true }));
  f.state.workspace = f.root;
  assert.throws(() => f.validate({ cleanup: true }), /outside the durable runs directory/);
});

test("cleanup of an escaping workspace symlink only removes the link, never its target", t => {
  const f = fixture(t);
  fs.rmSync(f.workspace, { recursive: true });
  const external = path.join(f.root, "outside-run");
  fs.mkdirSync(external);
  f.write("keep", "untouched", external);
  fs.symlinkSync(external, f.workspace);
  assert.throws(f.validate, /escapes workspace/);
  const plan = f.validate({ cleanup: true });
  fs.rmSync(plan.workspace, { recursive: true, force: true });
  assert.equal(fs.readFileSync(path.join(external, "keep"), "utf8"), "untouched");
});

test("state/report disagreement cannot skip stages", t => {
  const f = fixture(t);
  f.state.completed.push("build");
  assert.throws(f.validate, /completed stages disagree/);
  assert.throws(() => f.validate({ report: null }), /missing or mismatched durable report/);
});

function installRunner(f) {
  for (const file of [
    "scripts/simulate-production.mjs", "scripts/lib/production-simulation-resume.mjs",
    "scripts/lib/production-simulation-copy.mjs", "scripts/lib/productionSimulationPolicy.mjs",
  ]) {
    const dest = path.join(f.root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, file), dest);
  }
  f.write("state.json", JSON.stringify(f.state), path.join(f.root, ".local/production-simulation"));
  f.write("fixture-run.json", JSON.stringify(f.report), path.join(f.root, "reports/production-simulation"));
  f.write("historical.md", "untouched history", path.join(f.root, "reports/production-simulation"));
}

test("isolated runner fails before mkdir or report/state writes, even with --force", t => {
  const f = fixture(t);
  installRunner(f);
  fs.rmSync(f.copyRoot, { recursive: true });
  fs.rmSync(f.logsRoot, { recursive: true });
  const reportPath = path.join(f.root, "reports/production-simulation/fixture-run.json");
  const statePath = path.join(f.root, ".local/production-simulation/state.json");
  const before = [fs.readFileSync(reportPath, "utf8"), fs.readFileSync(statePath, "utf8")];
  const result = spawnSync(process.execPath, [path.join(f.root, "scripts/simulate-production.mjs"), "--resume", "--phase=build", "--force"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /preflight failed.*missing or dangling/);
  assert.ok(!fs.existsSync(f.copyRoot));
  assert.ok(!fs.existsSync(f.logsRoot));
  assert.ok(!fs.existsSync(path.join(f.workspace, "transient")));
  assert.deepEqual([fs.readFileSync(reportPath, "utf8"), fs.readFileSync(statePath, "utf8")], before);
});

test("isolated runner --cleanup exits without running stages or rewriting historical reports", t => {
  const f = fixture(t);
  installRunner(f);
  fs.rmSync(f.copyRoot, { recursive: true });
  const dir = path.join(f.root, "reports/production-simulation");
  const before = fs.readdirSync(dir).map(name => [name, fs.readFileSync(path.join(dir, name), "utf8")]);
  const result = spawnSync(process.execPath, [path.join(f.root, "scripts/simulate-production.mjs"), "--cleanup"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(f.workspace));
  assert.ok(!fs.existsSync(path.join(f.root, ".local/production-simulation/state.json")));
  assert.deepEqual(fs.readdirSync(dir).map(name => [name, fs.readFileSync(path.join(dir, name), "utf8")]), before);
});