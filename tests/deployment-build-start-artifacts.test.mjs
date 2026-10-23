import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildSync } from "esbuild";
import { buildPlan, startPlan } from "../script/deployment/plans.mjs";
import { writeBuildContract } from "../scripts/build-contract.mjs";
import { inspectArtifacts } from "../scripts/verify-runtime-artifacts.mjs";

const repo = process.cwd();
const requiredMembers = [
  "dist/build-complete.json",
  "dist/index.mjs",
  "dist/cluster.mjs",
  "dist/gateway.mjs",
  "dist/dns-node.mjs",
  "dist/dns-api.mjs",
  "dist/compute-sizing.mjs",
  "dist/retained-pdim-recovery-worker.mjs",
  "dist/public/index.html",
  "scripts/startup-health.mjs",
  "scripts/redis-supervisor.sh",
  "bin/boosterstate",
];
const sourceFiles = [
  ".dockerignore",
  "build.sh",
  "start.sh",
  "script/publish-capsules.ts",
  "script/deployment/plans.mjs",
  "script/lib/capsulePack.ts",
  "script/lib/dockerignoreScan.ts",
  "script/lib/deploymentControlFiles.ts",
  "script/lib/deploymentCapsuleCache.ts",
  "scripts/deployment/ports.replit",
  "scripts/build-contract.mjs",
  "scripts/start-production.mjs",
  "scripts/startup-health.mjs",
  "scripts/redis-supervisor.sh",
  "script/deployment/restore-one.mjs",
  "dist/pdim-restore.mjs",
];

function write(root, relative, contents = `fixture:${relative}\n`) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-build-start-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of sourceFiles) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repo, relative), target);
  }
  write(root, ".replit",
    '[deployment]\nbuild = ["npm", "run", "deployment:build"]\nrun = ["npm", "run", "deployment:start"]\n');
  write(root, "package.json",
    JSON.stringify({ type: "module", scripts: { "deployment:build": "bash build.sh", "deployment:start": "bash start.sh" } }) + "\n");
  write(root, "package-lock.json", '{"name":"isolated-fixture","lockfileVersion":3}\n');
  write(root, "vite.config.ts", "export default {};\n");
  write(root, "client/index.html", "<html></html>\n");
  write(root, "server/index.ts", "export const fixtureServer = true;\n");
  for (const relative of requiredMembers) {
    if (relative === "dist/build-complete.json" || relative === "scripts/startup-health.mjs" ||
        relative === "scripts/redis-supervisor.sh" || relative === "bin/boosterstate") continue;
    write(root, relative);
  }
  write(root, "external/maxcore/artifacts/api-server/dist/index.mjs");
  write(root, "bin/boosterstate", "#!/bin/sh\nexit 0\n");
  fs.chmodSync(path.join(root, "bin/boosterstate"), 0o755);
  const state = path.join(root, "deployment-state");
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, "app-capsule-ready"), "complete\n");
  fs.writeFileSync(path.join(state, "packer-ready"), "complete\n");
  const restoreOne = path.join(root, "dist/deployment/restore-one.mjs");
  fs.mkdirSync(path.dirname(restoreOne), { recursive: true });
  fs.copyFileSync(path.join(repo, "script/deployment/restore-one.mjs"), restoreOne);
  buildSync({
    entryPoints: [path.join(repo, "script/publish-capsules.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: path.join(root, "dist/publish-capsules.mjs"),
  });
  writeBuildContract(root);
  return root;
}

const childEnv = root => ({
  PATH: process.env.PATH,
  HOME: root,
  TMPDIR: root,
  NODE_ENV: "production",
  DEPLOY_TASK_CPU: "1",
  DEPLOY_STATE_DIR: path.join(root, "deployment-state"),
});

function runBuildTask(root) {
  return spawnSync("bash", ["build.sh", "--executive-task", "pack_app_remainder"], {
    cwd: root,
    env: childEnv(root),
    encoding: "utf8",
    timeout: 60_000,
  });
}

function runAppRestore(root) {
  const task = startPlan(process.execPath).find(item => item.id === "restore-app");
  assert.ok(task, "configured startup plan must include restore-app");
  return spawnSync(task.command, task.args, {
    cwd: root,
    env: childEnv(root),
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("configured deployment build orders a fresh remainder capsule before pruning and startup restore", () => {
  const deployment = fs.readFileSync(path.join(repo, ".replit"), "utf8");
  assert.match(deployment, /build\s*=\s*\["npm",\s*"run",\s*"deployment:build"\]/);
  assert.match(deployment, /run\s*=\s*\["npm",\s*"run",\s*"deployment:start"\]/);
  const packageScripts = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8")).scripts;
  assert.equal(packageScripts["deployment:build"], "bash build.sh");
  assert.equal(packageScripts["deployment:start"], "bash start.sh");

  const plan = buildPlan();
  const remainder = plan.find(item => item.id === "pack_app_remainder");
  assert.ok(remainder, "pre-fix build plan omitted the startup-required app remainder");
  assert.deepEqual(remainder.deps, ["app_capsule"]);
  assert.ok(plan.find(item => item.id === "prune").deps.includes("pack_app_remainder"));
  for (const id of ["pack_python", "pack_maxcore", "pack_pdim", "source"]) {
    assert.ok(plan.find(item => item.id === id).deps.includes("pack_app_remainder"),
      `${id} must not remove or snapshot files before remainder packing`);
  }
  const startup = startPlan(process.execPath);
  const restore = startup.find(item => item.id === "restore-app");
  const application = startup.find(item => item.id === "application");
  assert.deepEqual(restore.args.slice(1), [
    "app_remainder.pdim", "app_remainder.manifest.json", ".", ".pdim-restored-app",
  ]);
  assert.ok(application.deps.includes("restore-app"), "application must wait for app restore");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capsule-cli-entrypoint-"));
  try {
    fs.mkdirSync(path.join(root, "dist"));
    buildSync({
      entryPoints: [path.join(repo, "script/publish-capsules.ts")],
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      outfile: path.join(root, "dist/publish-capsules.mjs"),
    });
    const result = spawnSync(process.execPath, ["dist/publish-capsules.mjs", "format"], {
      cwd: root,
      env: childEnv(root),
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^zstd-\d+$/);
    assert.doesNotMatch(result.stdout, /Production build is missing|starting node/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("configured pack task emits attested required runtime members and startup restores them", async t => {
  const root = createFixture(t);
  const packed = runBuildTask(root);
  assert.equal(packed.status, 0, `${packed.stdout}\n${packed.stderr}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "app_remainder.manifest.json"), "utf8"));
  assert.ok(Number.isSafeInteger(manifest.sourceMemberCount) && manifest.sourceMemberCount > 0);
  assert.match(manifest.sourceInventorySha256, /^[a-f0-9]{64}$/);
  const artifacts = await inspectArtifacts(root, ["app_remainder"]);
  assert.equal(artifacts.ready, true, artifacts.failures.join("\n"));

  const listing = spawnSync("tar", ["--zstd", "-tf", "app_remainder.pdim"], {
    cwd: root,
    env: childEnv(root),
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(listing.status, 0, listing.stderr);
  const members = new Set(listing.stdout.trim().split("\n"));
  for (const file of requiredMembers) assert.ok(members.has(file), `capsule missing ${file}`);
  for (const bootstrapOnly of [
    "dist/pdim-restore.mjs",
    "dist/deployment/restore-one.mjs",
    "dist/publish-capsules.mjs",
  ]) assert.ok(!members.has(bootstrapOnly), `${bootstrapOnly} must remain outside the remainder capsule`);

  fs.rmSync(path.join(root, "server/index.ts"));
  fs.rmSync(path.join(root, "dist/cluster.mjs"));
  const restored = runAppRestore(root);
  assert.equal(restored.status, 0, `${restored.stdout}\n${restored.stderr}`);
  assert.equal(fs.readFileSync(path.join(root, "server/index.ts"), "utf8"), "export const fixtureServer = true;\n");
  assert.ok(fs.existsSync(path.join(root, "dist/cluster.mjs")));
  assert.equal(fs.readFileSync(path.join(root, ".pdim-restored-app"), "utf8"),
    `${manifest.sha256}\n${manifest.sourceInventorySha256}`);
});

test("missing and stale app-remainder artifacts fail closed", t => {
  const missingRoot = createFixture(t);
  const missing = runAppRestore(missingRoot);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing required runtime capsule/);
  assert.equal(fs.existsSync(path.join(missingRoot, ".pdim-restored-app")), false);

  const staleRoot = createFixture(t);
  fs.writeFileSync(path.join(staleRoot, "app_remainder.pdim"), "stale archive");
  fs.writeFileSync(path.join(staleRoot, "app_remainder.manifest.json"), '{"sha256":"stale"}');
  fs.writeFileSync(path.join(staleRoot, "server/index.ts"), "changed after build contract\n");
  const stale = runBuildTask(staleRoot);
  assert.notEqual(stale.status, 0);
  assert.match(`${stale.stdout}\n${stale.stderr}`, /Changed since build|Source file list changed since build/);
  assert.equal(fs.existsSync(path.join(staleRoot, "app_remainder.pdim")), false);
  assert.equal(fs.existsSync(path.join(staleRoot, "app_remainder.manifest.json")), false);
});

test("restore rejects a mismatched source inventory before merging files", t => {
  const root = createFixture(t);
  const packed = runBuildTask(root);
  assert.equal(packed.status, 0, `${packed.stdout}\n${packed.stderr}`);
  const manifestPath = path.join(root, "app_remainder.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.sourceInventorySha256 = "0".repeat(64);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.rmSync(path.join(root, "server/index.ts"));

  const restored = runAppRestore(root);
  assert.notEqual(restored.status, 0);
  assert.match(restored.stderr, /Failed to restore/);
  assert.equal(fs.existsSync(path.join(root, "server/index.ts")), false);
  assert.equal(fs.existsSync(path.join(root, ".pdim-restored-app")), false);
});
