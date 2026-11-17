import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { executeCompletionPlan, validatePlan, validateRelativePath } from "../scripts/testing/completion-executor.mjs";
import { buildInventory } from "../scripts/testing/repository-verification.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-executor-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "completion@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Completion Fixture"], { cwd: root });
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, ".gitignore"), ".local/\n");
  await fs.writeFile(path.join(root, "src", "sample.ts"), "export const value = 1;\n");
  execFileSync("git", ["add", ".gitignore", "src/sample.ts"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

async function manifestFor(root, changes) {
  const inventory = await buildInventory(root);
  return {
    schemaVersion: 1,
    sourceIdentity: {
      revision: inventory.sourceIdentity.revision,
      inputInventorySha256: inventory.sourceIdentity.inputInventorySha256,
      dirtyInputSha256: inventory.sourceIdentity.dirtyInputSha256,
    },
    changes,
    checks: [{ id: "runtime-contracts", script: "test:runtime-contracts" }],
  };
}

function replacement(content, before, id = "sample-fix") {
  return {
    id,
    path: "src/sample.ts",
    operation: "replace",
    beforeSha256: hash(before),
    afterSha256: hash(content),
    content,
  };
}

async function writePlan(root, plan) {
  const planPath = path.join(root, ".local", "plan.json");
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, JSON.stringify(plan));
  return { planPath, planSha256: hash(await fs.readFile(planPath)) };
}

const passingCheck = async (_command, _args, options) => ({
  status: "PASS", exitCode: 0, timedOut: false, interrupted: false,
  durationMs: 1, output: "fixture pass", log: options.logPath, logSha256: hash("fixture pass"),
});

test("rejects unsafe paths, unapproved commands, malformed hashes, and credential material", () => {
  assert.throws(() => validateRelativePath("../package.json"), /Unsafe/);
  assert.throws(() => validateRelativePath("node_modules/pkg/index.js"), /Unsafe/);
  assert.throws(() => validateRelativePath(".env"), /Secrets/);
  const content = "export const value = 2;\n";
  assert.throws(() => validatePlan({
    schemaVersion: 1, sourceIdentity: { revision: "a".repeat(40), inputInventorySha256: "b".repeat(64), dirtyInputSha256: "c".repeat(64) },
    changes: [replacement(content, "old")], checks: [{ id: "bad", script: "npm run deploy" }],
  }), /only:/);
  assert.throws(() => validatePlan({
    schemaVersion: 1, sourceIdentity: { revision: "a".repeat(40), inputInventorySha256: "b".repeat(64), dirtyInputSha256: "c".repeat(64) },
    changes: [{ ...replacement("const x = 'sk_live_abc';", "old"), afterSha256: hash("const x = 'sk_live_abc';") }],
    checks: [{ id: "safe", script: "check:server" }],
  }), /Secret-like/);
});

test("dry-run validates the source-bound plan but does not change files", async () => {
  const root = await fixture();
  try {
    const before = "export const value = 1;\n";
    const after = "export const value = 2;\n";
    const plan = await manifestFor(root, [replacement(after, before)]);
    const file = await writePlan(root, plan);
    const report = await executeCompletionPlan({ root, ...file });
    assert.equal(report.status, "DRY_RUN_READY");
    assert.equal(report.changes[0].status, "READY");
    assert.equal(await fs.readFile(path.join(root, "src/sample.ts"), "utf8"), before);
    assert.equal(report.readinessStatus, "UNVERIFIED");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applies a hash-pinned change, verifies it, and retains an integrity-checked backup", async () => {
  const root = await fixture();
  try {
    const before = "export const value = 1;\n";
    const after = "export const value = 2;\n";
    const plan = await manifestFor(root, [replacement(after, before)]);
    const file = await writePlan(root, plan);
    const report = await executeCompletionPlan({
      root, ...file, expectedPlanSha256: file.planSha256, apply: true, runCheck: passingCheck,
    });
    assert.equal(report.status, "APPLIED_VERIFIED");
    assert.equal(await fs.readFile(path.join(root, "src/sample.ts"), "utf8"), after);
    const backup = path.join(root, report.changes[0].backup);
    assert.equal(await fs.readFile(backup, "utf8"), before);
    assert.equal(report.checks[0].status, "PASS");
    assert.equal(report.productionReady, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rolls back the complete patch transaction when a required check fails", async () => {
  const root = await fixture();
  try {
    const before = "export const value = 1;\n";
    const after = "export const value = 2;\n";
    const plan = await manifestFor(root, [replacement(after, before)]);
    const file = await writePlan(root, plan);
    const report = await executeCompletionPlan({
      root, ...file, expectedPlanSha256: file.planSha256, apply: true,
      runCheck: async (_command, _args, options) => ({
        status: "FAIL", exitCode: 1, timedOut: false, interrupted: false,
        durationMs: 1, output: "assertion failed", log: options.logPath, logSha256: hash("assertion failed"),
      }),
    });
    assert.equal(report.status, "FAILED");
    assert.equal(report.rollback.status, "COMPLETE");
    assert.equal(report.changes[0].status, "ROLLED_BACK");
    assert.equal(await fs.readFile(path.join(root, "src/sample.ts"), "utf8"), before);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects an edited plan hash and stale source before touching the target", async () => {
  const root = await fixture();
  try {
    const before = "export const value = 1;\n";
    const after = "export const value = 2;\n";
    const plan = await manifestFor(root, [replacement(after, before)]);
    const file = await writePlan(root, plan);
    await assert.rejects(executeCompletionPlan({
      root, ...file, expectedPlanSha256: "0".repeat(64), apply: true,
    }), /SHA-256/);
    await fs.writeFile(path.join(root, "src/sample.ts"), "export const value = 3;\n");
    const stalePlanFile = path.join(root, "plan.json");
    await fs.writeFile(stalePlanFile, JSON.stringify(plan));
    const staleReport = await executeCompletionPlan({
      root, planPath: stalePlanFile, expectedPlanSha256: hash(JSON.stringify(plan)), apply: true,
    });
    assert.equal(staleReport.status, "BLOCKED");
    assert.match(staleReport.blockReason, /source input hashes/);
    assert.equal(await fs.readFile(path.join(root, "src/sample.ts"), "utf8"), "export const value = 3;\n");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rerunning an already applied plan verifies without applying its patch again", async () => {
  const root = await fixture();
  try {
    const before = "export const value = 1;\n";
    const after = "export const value = 2;\n";
    const plan = await manifestFor(root, [replacement(after, before)]);
    const file = await writePlan(root, plan);
    const first = await executeCompletionPlan({
      root, ...file, expectedPlanSha256: file.planSha256, apply: true, runCheck: passingCheck,
    });
    assert.equal(first.status, "APPLIED_VERIFIED");
    const second = await executeCompletionPlan({
      root, ...file, expectedPlanSha256: file.planSha256, apply: true, runCheck: passingCheck,
    });
    assert.equal(second.status, "ALREADY_APPLIED_VERIFIED");
    assert.equal(await fs.readFile(path.join(root, "src/sample.ts"), "utf8"), after);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
