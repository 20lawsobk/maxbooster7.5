import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { runCompletionLoop } from "../scripts/testing/completion-loop.mjs";
import { buildInventory, sealReport } from "../scripts/testing/repository-verification.mjs";
import { generateEvidenceBasedPlans } from "../scripts/testing/completion-patch-rules.mjs";

const roots = [];
const CURRENT_DEV = "node scripts/testing/repository-verification.mjs dev && bash scripts/start-dev.sh";
const STALE_DEV = "node scripts/testing/repository-verification.mjs preflight && bash scripts/start-dev.sh";
const TEST_NAME = "development preflight gates the unchanged application launcher";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sealLearning(report) {
  const unsigned = {
    schemaVersion: 1,
    reportSha256: report.integrity.reportSha256,
    sourceIdentity: report.sourceIdentity,
    currentProposals: [],
  };
  return {
    ...unsigned,
    integrity: { algorithm: "sha256", sha256: hash(canonical(unsigned)) },
  };
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-patch-rule-"));
  roots.push(root);
  await fs.mkdir(path.join(root, "tests"));
  await fs.mkdir(path.join(root, ".local"));
  await fs.writeFile(path.join(root, ".gitignore"), ".local/\n");
  await fs.writeFile(path.join(root, "package.json"), `${JSON.stringify({
    name: "completion-patch-fixture",
    private: true,
    scripts: {
      dev: CURRENT_DEV,
      "test:runtime-contracts": "node --test tests/npm-build-start-contract.test.mjs",
    },
  }, null, 2)}\n`);
  await fs.writeFile(path.join(root, "tests/npm-build-start-contract.test.mjs"), [
    'import assert from "node:assert/strict";',
    'import fs from "node:fs/promises";',
    'import path from "node:path";',
    'import test from "node:test";',
    'const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8"));',
    "const scripts = packageJson.scripts;",
    `test(${JSON.stringify(TEST_NAME)}, () => {`,
    `  assert.equal(scripts.dev, ${JSON.stringify(STALE_DEV)});`,
    "});",
    "",
  ].join("\n"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Completion Patch Fixture"], { cwd: root });
  execFileSync("git", ["config", "user.email", "completion-patch@example.invalid"], { cwd: root });
  execFileSync("git", ["add", ".gitignore", "package.json", "tests"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

async function createCurrentEvidence(root) {
  const inventory = await buildInventory(root);
  const report = sealReport({
    schemaVersion: 1,
    mode: "dev",
    sourceIdentity: inventory.sourceIdentity,
    checks: [{ id: "development-preflight", status: "PASS" }],
    skipped: [],
  });
  const learning = sealLearning(report);
  const reportPath = path.join(
    root, ".local/repository-verification/runs/fixture/report.json",
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(
    path.join(path.dirname(reportPath), "learning.json"),
    `${JSON.stringify(learning, null, 2)}\n`,
  );
  return { report, learning, reportPath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

test("deterministic patch plan applies through the existing executor and passes its declared regression check", async () => {
  const root = await createFixture();
  let cycle = 0;
  const result = await runCompletionLoop({
    root,
    mode: "dev",
    maxCycles: 2,
    intervalMs: 1000,
    runCycle: async () => {
      cycle++;
      const evidence = await createCurrentEvidence(root);
      return {
        cycleId: `fixture-cycle-${cycle}`,
        mode: "dev",
        execution: { status: "PASS", exitCode: 0, timedOut: false, interrupted: false, durationMs: 1 },
        readiness: { ready: false, status: "NOT_READY", blockers: ["report:full-verification-required"] },
        sourceIdentity: evidence.report.sourceIdentity,
        reportSha256: evidence.report.integrity.reportSha256,
        runDirectory: path.relative(root, path.dirname(evidence.reportPath)),
        report: evidence.report,
        learning: evidence.learning,
        reportPath: path.relative(root, evidence.reportPath),
      };
    },
  });

  const testSource = await fs.readFile(path.join(root, "tests/npm-build-start-contract.test.mjs"), "utf8");
  assert.match(testSource, new RegExp(CURRENT_DEV.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(cycle, 2);
  assert.equal(result.status, "LIMIT_REACHED");
  assert.equal(result.plansAppliedThisInvocation, 1);
  const state = JSON.parse(await fs.readFile(
    path.join(root, ".local/repository-verification/completion-loop/state.json"), "utf8",
  ));
  assert.equal(state.appliedPlans.length, 1);
  assert.equal(state.appliedPlans[0].ruleId, "sync-dev-start-contract");
  assert.equal(state.appliedPlans[0].status, "APPLIED_VERIFIED");
  assert.equal(state.cycles.at(-1).patchGeneration.status, "NO_MATCH");
});

test("a generated patch rule does not repeat the same failed plan after restart", async () => {
  const root = await createFixture();
  const evidence = await createCurrentEvidence(root);
  let attempts = 0;
  const runCycle = async () => ({
    cycleId: "same-evidence",
    mode: "dev",
    execution: { status: "PASS", exitCode: 0, timedOut: false, interrupted: false, durationMs: 1 },
    readiness: { ready: false, status: "NOT_READY", blockers: ["report:full-verification-required"] },
    sourceIdentity: evidence.report.sourceIdentity,
    reportSha256: evidence.report.integrity.reportSha256,
    runDirectory: path.relative(root, path.dirname(evidence.reportPath)),
    report: evidence.report,
    learning: evidence.learning,
    reportPath: path.relative(root, evidence.reportPath),
  });
  const runPlan = async () => {
    attempts++;
    return { status: "FAILED", exitCode: 2, interrupted: false, log: null, logSha256: null };
  };
  await runCompletionLoop({ root, mode: "dev", maxCycles: 1, intervalMs: 1000, runCycle, runPlan });
  await runCompletionLoop({ root, mode: "dev", maxCycles: 1, intervalMs: 1000, runCycle, runPlan });
  assert.equal(attempts, 1);
});

test("tampered report evidence blocks a deterministic plan before the executor is called", async () => {
  const root = await createFixture();
  const evidence = await createCurrentEvidence(root);
  const generated = await generateEvidenceBasedPlans({
    root,
    ...evidence,
  });
  assert.equal(generated.status, "PATCH_READY");
  const candidate = generated.plans[0];
  const planPath = path.join(
    root, ".local/repository-verification/completion-loop/generated-plans/manual.json",
  );
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, candidate.bytes, { mode: 0o600 });
  await fs.appendFile(evidence.reportPath, "tampered\n");
  let executionStarted = false;
  await assert.rejects(runCompletionLoop({
    root,
    mode: "dev",
    maxCycles: 1,
    intervalMs: 1000,
    approvedPlanPath: planPath,
    expectedPlanSha256: candidate.sha256,
    runCycle: async () => { throw new Error("must not run with tampered evidence"); },
    runPlan: async () => { executionStarted = true; return { status: "APPLIED_VERIFIED", exitCode: 0 }; },
  }), /registered deterministic evidence/);
  assert.equal(executionStarted, false);
});
