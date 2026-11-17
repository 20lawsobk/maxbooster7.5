import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { executeCompletionPlan } from "../scripts/testing/completion-executor.mjs";
import {
  prepareProposalPlanDraft,
  recordProposalDecision,
} from "../scripts/testing/completion-proposal-feedback.mjs";
import { recordLearningOutcome } from "../scripts/testing/completion-learning.mjs";
import { buildInventory, sealReport } from "../scripts/testing/repository-verification.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "completion-proposal-link-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "completion@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Completion Fixture"], { cwd: root });
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, ".gitignore"), ".local/\n");
  const sourceFile = path.join(root, "src", "sample.ts");
  const before = "export const value = 1;\n";
  const after = "export const value = 2;\n";
  await fs.writeFile(sourceFile, before);
  execFileSync("git", ["add", ".gitignore", "src/sample.ts"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return { root, sourceFile, before, after };
}

async function prepareApprovedPlan(fixtureState) {
  const { root, before, after } = fixtureState;
  const inventory = await buildInventory(root);
  const sourceIdentity = inventory.sourceIdentity;
  const report = sealReport({
    schemaVersion: 1,
    mode: "preflight",
    gateStatus: "FAIL",
    readinessStatus: "UNVERIFIED",
    productionReady: false,
    sourceIdentity,
    checks: [{
      id: "check:server",
      status: "FAIL",
      exitCode: 1,
      command: ["npm", "run", "check:server"],
    }],
    changes: [],
  });
  const approvalRunId = "2026-11-17T02-00-00-proposal";
  const approvalRunDirectory = path.join(root, ".local", "repository-verification", "runs", approvalRunId);
  await fs.mkdir(approvalRunDirectory, { recursive: true });
  const learning = await recordLearningOutcome({
    root,
    runDirectory: approvalRunDirectory,
    report,
  });
  await fs.writeFile(
    path.join(approvalRunDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  const proposal = learning.summary.currentProposals.find(item => item.checkId === "check:server");
  const accepted = await recordProposalDecision({
    root,
    runDirectory: approvalRunDirectory,
    proposalId: proposal.id,
    decision: "accept-for-plan",
  });
  const draft = await prepareProposalPlanDraft({
    root,
    runDirectory: approvalRunDirectory,
    proposalId: proposal.id,
  });
  const plan = {
    schemaVersion: 1,
    sourceIdentity,
    proposalLink: draft.draft.proposalLink,
    changes: [{
      id: "verified-proposal-fix",
      path: "src/sample.ts",
      operation: "replace",
      beforeSha256: hash(before),
      afterSha256: hash(after),
      content: after,
    }],
    checks: [{ id: "runtime-contracts", script: "test:runtime-contracts" }],
  };
  const planPath = path.join(root, ".local", "authored-plan.json");
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  return {
    root,
    planPath,
    planSha256: hash(await fs.readFile(planPath)),
    proposal,
    accepted,
    approvalRunDirectory,
    report,
  };
}

const passingCheck = async (_command, _args, options) => ({
  status: "PASS",
  exitCode: 0,
  timedOut: false,
  interrupted: false,
  durationMs: 1,
  output: "fixture pass",
  log: options.logPath,
  logSha256: hash("fixture pass"),
});

test("only the matching fully verified executor plan resolves its accepted proposal", async () => {
  const state = await fixture();
  try {
    const prepared = await prepareApprovedPlan(state);
    const report = await executeCompletionPlan({
      root: prepared.root,
      planPath: prepared.planPath,
      expectedPlanSha256: prepared.planSha256,
      apply: true,
      runCheck: passingCheck,
    });
    assert.equal(report.status, "APPLIED_VERIFIED");
    assert.equal(report.proposalLink.approvalDecisionId, prepared.accepted.record.decisionId);

    const verificationRun = path.dirname(report.reportPath);
    const learned = await recordLearningOutcome({
      root: prepared.root,
      runDirectory: verificationRun,
      report,
    });
    const resolution = learned.summary.verifiedProposalResolutions.find(item =>
      item.approvalDecisionId === prepared.accepted.record.decisionId);
    assert.equal(resolution.state, "RESOLVED_BY_VERIFIED_PLAN");
    assert.equal(resolution.proposalKey, prepared.proposal.proposalKey);
    assert.deepEqual(resolution.passedCheckIds, ["runtime-contracts"]);
    assert.equal(learned.summary.proposalPlanAttempts[0].resolved, true);
    assert.equal(learned.summary.productionReady, false);
  } finally {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test("failed verification remains unresolved and preserves the executor rollback", async () => {
  const state = await fixture();
  try {
    const prepared = await prepareApprovedPlan(state);
    const report = await executeCompletionPlan({
      root: prepared.root,
      planPath: prepared.planPath,
      expectedPlanSha256: prepared.planSha256,
      apply: true,
      runCheck: async (_command, _args, options) => ({
        status: "FAIL",
        exitCode: 1,
        timedOut: false,
        interrupted: false,
        durationMs: 1,
        output: "fixture failure",
        log: options.logPath,
        logSha256: hash("fixture failure"),
      }),
    });
    assert.equal(report.status, "FAILED");
    assert.equal(report.rollback.status, "COMPLETE");
    assert.equal(report.proposalLink.approvalDecisionId, prepared.accepted.record.decisionId);
    assert.equal(await fs.readFile(state.sourceFile, "utf8"), state.before);

    const learned = await recordLearningOutcome({
      root: prepared.root,
      runDirectory: path.dirname(report.reportPath),
      report,
    });
    assert.deepEqual(learned.summary.verifiedProposalResolutions, []);
    assert.equal(learned.summary.proposalPlanAttempts[0].resolved, false);
    assert.equal(learned.summary.proposalPlanAttempts[0].checks[0].status, "FAIL");
  } finally {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test("superseded proposal approval is blocked before the executor edits files", async () => {
  const state = await fixture();
  try {
    const prepared = await prepareApprovedPlan(state);
    const proposal = prepared.proposal;
    await recordProposalDecision({
      root: prepared.root,
      runDirectory: prepared.approvalRunDirectory,
      proposalId: proposal.id,
      decision: "reopen",
    });
    await assert.rejects(executeCompletionPlan({
      root: prepared.root,
      planPath: prepared.planPath,
      expectedPlanSha256: prepared.planSha256,
      apply: true,
      runCheck: passingCheck,
    }), /superseded/);
    assert.equal(await fs.readFile(state.sourceFile, "utf8"), state.before);
  } finally {
    await fs.rm(state.root, { recursive: true, force: true });
  }
});
