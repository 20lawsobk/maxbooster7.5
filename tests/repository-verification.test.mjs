import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  buildInventory,
  canonical,
  classifyPath,
  cleanEnvironment,
  runOwned,
  sealReport,
  verifyReport,
} from "../scripts/testing/repository-verification.mjs";

test("inventory classifications retain explicit code, documentation, archive, generated, binary and report lifecycles", () => {
  assert.equal(classifyPath("server/routes/example.ts").lifecycle, "source");
  assert.equal(classifyPath("external/maxcore/server.py").lifecycle, "imported-source");
  assert.equal(classifyPath("tests/flow.test.mjs").lifecycle, "tests");
  assert.equal(classifyPath("package.json").lifecycle, "config");
  assert.equal(classifyPath("atlas/production.atlas").lifecycle, "config");
  assert.equal(classifyPath("docs/testing/README.md").lifecycle, "docs");
  assert.equal(classifyPath("reports/history/result.json").lifecycle, "report");
  assert.equal(classifyPath("archive-capsules/old/source.ts").lifecycle, "archive");
  assert.equal(classifyPath("dist/server/index.mjs").lifecycle, "generated");
  assert.equal(classifyPath("assets/logo.png").fileType, "binary");
  assert.equal(classifyPath("assets/logo.png").lifecycle, "binary");
  assert.equal(classifyPath("docs/testing/README.md").behaviorEvidence.status, "NOT APPLICABLE");
  assert.equal(classifyPath("server/routes/example.ts").behaviorEvidence.status, "UNVERIFIED");
});

test("report integrity detects any mutation and canonical hashing ignores object key order", () => {
  const report = sealReport({ schemaVersion: 1, mode: "preflight", checks: [{ id: "local", status: "PASS" }] });
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.equal(verifyReport(report), true);
  assert.equal(verifyReport({ ...report, mode: "full" }), false);
  assert.equal(verifyReport({ ...report, checks: [{ id: "local", status: "FAIL" }] }), false);
});

test("source and dirty-input identities change when a tracked input changes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repository-verify-drift-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "verification@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Verification Fixture"], { cwd: root });
    await fs.mkdir(path.join(root, "server"), { recursive: true });
    await fs.writeFile(path.join(root, "server/example.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "server/example.ts"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    const before = await buildInventory(root);
    const cleanSource = before.trackedFiles.find(row => row.path === "server/example.ts");
    assert.equal(cleanSource.hashStatus, "GIT_OBJECT_ID");
    assert.match(cleanSource.gitObjectId, /^[a-f0-9]{40,64}$/);
    await fs.writeFile(path.join(root, "server/example.ts"), "export const value = 2;\n");
    const after = await buildInventory(root);
    const changedSource = after.trackedFiles.find(row => row.path === "server/example.ts");
    assert.equal(changedSource.hashStatus, "HASHED");
    assert.notEqual(before.sourceIdentity.inputInventorySha256, after.sourceIdentity.inputInventorySha256);
    assert.notEqual(before.sourceIdentity.dirtyInputSha256, after.sourceIdentity.dirtyInputSha256);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bounded command timeout terminates its process group and retains the log", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repository-verify-timeout-"));
  const logPath = path.join(root, "timeout.log");
  try {
    const result = await runOwned(process.execPath, ["-e", "console.log('started'); setInterval(() => {}, 1000)"], {
      cwd: root,
      timeoutMs: 1000,
      logPath,
      env: cleanEnvironment(),
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.timedOut, true);
    assert.notEqual(result.exitCode, 0);
    assert.match(await fs.readFile(logPath, "utf8"), /started/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing executable is reported as blocked rather than passed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repository-verify-missing-"));
  try {
    const result = await runOwned("repository-verification-command-that-does-not-exist", [], {
      cwd: root,
      timeoutMs: 1000,
      logPath: path.join(root, "missing.log"),
      env: cleanEnvironment(),
    });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.exitCode, 127);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("explicit cancellation returns after terminating the owned process group", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repository-verify-cancel-"));
  const controller = new AbortController();
  try {
    const resultPromise = runOwned(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      cwd: root,
      timeoutMs: 10_000,
      logPath: path.join(root, "cancel.log"),
      env: cleanEnvironment(),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100).unref();
    const result = await resultPromise;
    assert.equal(result.status, "FAIL");
    assert.equal(result.interrupted, true);
    assert.equal(result.timedOut, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("npm development command does not wait for repository analysis before application startup", async () => {
  const project = JSON.parse(await fs.readFile("package.json", "utf8"));
  const command = project.scripts.dev;
  const launcher = await fs.readFile("scripts/start-dev.sh", "utf8");
  assert.equal(command, "bash scripts/start-dev.sh");
  const readinessGate = launcher.indexOf('if [[ "$_READINESS_STATUS" != "0" ]]');
  const completionAnalysis = launcher.indexOf("node scripts/testing/repository-verification.mjs dev &");
  assert.ok(readinessGate >= 0);
  assert.ok(completionAnalysis > readinessGate);
  assert.match(launcher, /wait -n -p _EXITED_PID/);
  assert.match(launcher, /_stop_owned "\$_VERIFICATION_PID"/);
});

test("preflight command environment excludes application credentials", () => {
  const environment = cleanEnvironment();
  assert.deepEqual(Object.keys(environment).sort(),
    ["CI", "GIT_OPTIONAL_LOCKS", "HOME", "LANG", "PATH", "TMPDIR"].sort());
  assert.equal(environment.GIT_OPTIONAL_LOCKS, "0");
  assert.equal(Object.hasOwn(environment, "DATABASE_URL"), false);
  assert.equal(Object.hasOwn(environment, "STRIPE_SECRET_KEY"), false);
});
