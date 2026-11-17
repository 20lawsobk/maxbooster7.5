import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { sealReport } from "../scripts/testing/repository-verification.mjs";
import { recordLearningOutcome } from "../scripts/testing/completion-learning.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-learning-"));
  const runDirectory = async id => {
    const directory = path.join(root, ".local", "runs", id);
    await fs.mkdir(directory, { recursive: true });
    return directory;
  };
  return { root, runDirectory };
}

function report({ mode = "preflight", checks = [], status = undefined, changes = [], plan = undefined, existingRunner = undefined } = {}) {
  return sealReport({
    schemaVersion: 1,
    mode,
    gateStatus: status ?? (checks.some(check => check.status !== "PASS") ? "FAIL" : "PASS"),
    status,
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    sourceIdentity: {
      revision: "a".repeat(40),
      inputInventorySha256: "b".repeat(64),
      dirtyInputSha256: "c".repeat(64),
    },
    checks,
    changes,
    ...(existingRunner ? { existingRunner } : {}),
    ...(plan ?? {}),
  });
}

async function fullRunArtifacts(run) {
  const output = path.join(run, "existing-groups");
  const orchestration = path.join(output, "orchestration");
  await fs.mkdir(orchestration, { recursive: true });
  const registerPath = path.join(output, "platform-register.json");
  const register = JSON.stringify({ sourceRevision: "a".repeat(40) });
  await fs.writeFile(registerPath, register);
  const remediationPath = path.join(output, "remediation.json");
  const remediation = {
    inputSha256: {
      "reports/test-verification/platform-register.json": createHash("sha256").update(register).digest("hex"),
    },
    items: [{
      id: "billing:entitlement",
      kind: "missing_evidence",
      status: "unresolved",
      priority: 1,
      file: "server/billing.ts",
      check: "Verify entitlement readback.",
      actions: ["Trace the entitlement handler to its durable source.", "Test ordinary and administrator account boundaries."],
      reproduce: { command: "npm run test:entitlement" },
      evidence: "reports/entitlement.json",
      observed: "sk_live_do_not_persist",
    }],
  };
  await fs.writeFile(remediationPath, JSON.stringify(remediation));
  return {
    resultPath: path.join(orchestration, "results.json"),
    remediationPath,
  };
}

test("records repeated failures and produces source-bound proposals without raw output", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const check = {
      id: "generation/social-content",
      status: "FAIL",
      exitCode: 1,
      command: ["npm", "run", "test:runtime-contracts"],
      output: "sensitive log content that must not be retained",
      nextAction: "Reproduce the failing social generation contract.",
    };
    const firstReport = report({ checks: [check] });
    const firstRun = await runDirectory("2026-11-17T00-00-00-first");
    const first = await recordLearningOutcome({ root, runDirectory: firstRun, report: firstReport });
    assert.equal(first.summary.currentProposals[0].recurrence.matchingObservations, 1);
    assert.equal(first.summary.productionReady, false);

    const secondRun = await runDirectory("2026-11-17T00-01-00-second");
    const second = await recordLearningOutcome({ root, runDirectory: secondRun, report: firstReport });
    assert.equal(second.summary.history.analyzedRecords, 2);
    assert.equal(second.summary.currentProposals[0].recurrence.matchingObservations, 2);
    assert.equal(second.summary.currentProposals[0].recommendedNextAction, check.nextAction);

    const record = await fs.readFile(second.eventPath, "utf8");
    assert.doesNotMatch(record, /sensitive log content/);
    assert.doesNotMatch(record, /npm run test:runtime-contracts/);
    assert.equal((await fs.stat(second.eventPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.dirname(second.eventPath))).mode & 0o777, 0o700);
    assert.equal(second.summary.benchmark.competitorComparisons, "UNCONFIGURED");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("records only fully verified completion plans as learned interventions", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T00-02-00-plan");
    const verified = report({
      mode: "execute",
      status: "APPLIED_VERIFIED",
      checks: [{ id: "check:server", status: "PASS", command: ["npm", "run", "check:server"] }],
      changes: [{ id: "fix", path: "server/fix.ts", status: "APPLIED" }],
      plan: { planSha256: "d".repeat(64), planPath: ".local/plan.json" },
    });
    const result = await recordLearningOutcome({ root, runDirectory: run, report: verified });
    assert.equal(result.summary.history.verifiedPlanRuns, 1);
    assert.equal(result.summary.latestVerifiedInterventions[0].changePaths[0], "server/fix.ts");

    const rejectedRun = await runDirectory("2026-11-17T00-03-00-rollback");
    const rolledBack = report({
      mode: "execute",
      status: "FAILED",
      checks: [{ id: "check:server", status: "FAIL" }],
      changes: [{ id: "fix", path: "server/fix.ts", status: "ROLLED_BACK" }],
    });
    const failed = await recordLearningOutcome({ root, runDirectory: rejectedRun, report: rolledBack });
    assert.equal(failed.summary.history.verifiedPlanRuns, 1);
    assert.equal(failed.summary.currentProposals[0].relatedVerifiedPlans.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects unsealed reports and refuses learning paths that escape the repository", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T00-04-00-invalid");
    const invalid = report({ checks: [] });
    await assert.rejects(
      recordLearningOutcome({ root, runDirectory: run, report: { ...invalid, gateStatus: "FAIL" } }),
      /integrity-verified/,
    );
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "completion-learning-outside-"));
    try {
      await assert.rejects(
        recordLearningOutcome({ root, runDirectory: outside, report: invalid }),
        /inside the repository/,
      );
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("marks corrupted history degraded and keeps current findings visible", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T00-05-00-current");
    const current = report({
      checks: [{ id: "check:client", status: "BLOCKED", command: ["npm", "run", "check:client"] }],
    });
    const eventDir = path.join(root, ".local", "repository-verification", "learning", "observations");
    await fs.mkdir(eventDir, { recursive: true });
    await fs.writeFile(path.join(eventDir, "2026-11-16T00-00-00-tampered.json"), JSON.stringify({ schemaVersion: 1 }));
    const result = await recordLearningOutcome({ root, runDirectory: run, report: current });
    assert.equal(result.summary.history.status, "DEGRADED");
    assert.match(result.summary.history.warnings.join(" "), /integrity check failed/);
    assert.equal(result.summary.currentProposals.length, 1);
    assert.equal(result.summary.currentProposals[0].priority, "BLOCKED");
    assert.match(result.summary.currentProposals[0].recommendedNextAction, /prerequisite/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("only a fresh full-run launch audit can mark internal benchmark evidence current", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T00-06-00-full");
    const full = report({
      mode: "full",
      checks: [{ id: "launch-readiness-audit", status: "PASS", output: JSON.stringify({ sourceFreshness: "PASS" }) }],
    });
    const result = await recordLearningOutcome({ root, runDirectory: run, report: full });
    assert.equal(result.summary.benchmark.internalCoverage, "CURRENT_AUDIT_PRESENT");
    assert.equal(result.summary.benchmark.competitorComparisons, "UNCONFIGURED");
    assert.match(result.summary.benchmark.reason, /Competitor superiority requires dated public evidence/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("uses only fresh full-run remediation artifacts and learns their repeated actionable gaps", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const makeRun = async id => {
      const run = await runDirectory(id);
      const artifacts = await fullRunArtifacts(run);
      const full = report({
        mode: "full",
        checks: [{
          id: "launch-readiness-audit",
          status: "PASS",
          output: JSON.stringify({ sourceFreshness: "PASS" }),
        }],
        existingRunner: { sourceInputsUnchanged: true, resultPath: artifacts.resultPath },
      });
      return recordLearningOutcome({ root, runDirectory: run, report: full });
    };

    const first = await makeRun("2026-11-17T00-07-00-full-first");
    assert.equal(first.summary.currentRemediation.status, "CURRENT");
    assert.equal(first.summary.currentRemediation.unresolvedItems, 1);
    const firstProposal = first.summary.currentProposals.find(row => row.remediationId === "billing:entitlement");
    assert.deepEqual(firstProposal.implementationSteps, [
      "Trace the entitlement handler to its durable source.",
      "Test ordinary and administrator account boundaries.",
    ]);
    assert.equal(firstProposal.recurrence.matchingObservations, 1);

    const second = await makeRun("2026-11-17T00-08-00-full-second");
    const repeated = second.summary.currentProposals.find(row => row.remediationId === "billing:entitlement");
    assert.equal(repeated.recurrence.matchingObservations, 2);
    assert.equal(second.summary.benchmark.remediationInventory, "CURRENT");
    const event = await fs.readFile(second.eventPath, "utf8");
    assert.doesNotMatch(event, /sk_live_do_not_persist/);
    assert.doesNotMatch(event, /npm run test:entitlement/);

    const staleRun = await runDirectory("2026-11-17T00-09-00-full-stale");
    const staleArtifacts = await fullRunArtifacts(staleRun);
    const stale = report({
      mode: "full",
      checks: [{
        id: "launch-readiness-audit",
        status: "PASS",
        output: JSON.stringify({ sourceFreshness: "PASS" }),
      }],
      existingRunner: { sourceInputsUnchanged: false, resultPath: staleArtifacts.resultPath },
    });
    const staleResult = await recordLearningOutcome({ root, runDirectory: staleRun, report: stale });
    assert.equal(staleResult.summary.currentRemediation.status, "UNVERIFIED");
    assert.equal(staleResult.summary.currentProposals.some(row => row.remediationId), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bounds persisted history and proposal volume while reporting every omitted finding", async () => {
  const { root, runDirectory } = await fixture();
  try {
    const run = await runDirectory("2026-11-17T00-10-00-large");
    const checks = Array.from({ length: 2_005 }, (_, index) => ({
      id: `check:${String(index).padStart(4, "0")}`,
      status: "FAIL",
      exitCode: 1,
      command: ["npm", "run", "check"],
      output: "not copied",
      nextAction: `Review failure ${index}`,
    }));
    const result = await recordLearningOutcome({ root, runDirectory: run, report: report({ checks }) });
    assert.equal(result.summary.currentProposals.length, 500);
    assert.equal(result.summary.proposalCounts.totalCheckCandidates, 2_005);
    assert.equal(result.summary.proposalCounts.omittedCheckCandidates, 1_505);
    const event = JSON.parse(await fs.readFile(result.eventPath, "utf8"));
    assert.equal(event.checks.length, 2_000);
    assert.equal(event.truncated.checks, 5);
    assert.equal((await fs.stat(result.eventPath)).size <= 8 * 1024 * 1024, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
